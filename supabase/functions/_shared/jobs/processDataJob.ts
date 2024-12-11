// import { defineSecret } from "firebase-functions/params";
// import { Readable } from "stream";
// import csv from "csv-parser";
// import NLPGeminiPlugin from "../plugins/nlp/nlpGeminiPlugin";
// const geminiApiKeySecret = defineSecret("GEMINI_API_KEY");

import * as config from "../../_shared/configs/index.ts";
import { StorageService } from "../services/storage/storageService.ts";
import { NlpService } from "../services/nlp/nlpService.ts";

interface OrganisationData {
  [key: string]: any;
}

export class ProcessDataJob<T> {
  private storageService: StorageService;
  private nlpService: NlpService;
  // private tasksService: any;

  constructor(
    // tasksService: any,
    storageService: StorageService = new StorageService(),
    nlpService: NLPService = new NlpService(),
  ) {
    this.storageService = storageService;
    this.nlpService = nlpService;
    // this.tasksService = tasksService;
  }

  async start({ connection, dataType, dryRun, data }: {
    connection: any;
    dataType: any;
    data: any;
    dryRun: boolean;
}): Promise<any> {
    console.log(`Processing data from connection: ${connection}`);
    try {
      // -----------Step 1: Get organisation's ID and data----------- 
      const inferOrganisationResult = await this.inferOrganisation({ connection, data });
      let organisationId, organisationData;

      if (inferOrganisationResult.status != 200) {
        throw Error(inferOrganisationResult.message);
      }

      [organisationId, organisationData] = inferOrganisationResult.data;
      console.log(`Use these: organisationId: ${organisationId} and organisationData: ${JSON.stringify(organisationData)}`);

      // -----------Step 2: Get object types accessible to the organisation----------- 
      const getObjectTypesResult = await this.getObjectTypes({organisationId: organisationId});
      if (getObjectTypesResult.status != 200) {
        throw Error(getObjectTypesResult.message);
      }
      const objectTypes = getObjectTypesResult.data; // List of maps of object types as in the database
      const objectTypesIds = objectTypes.map(item => item.id); // List of strings of the ID of each object type
      objectTypesIds.push("unknown"); // Also add unknown in cases it cannot detect which to return // TODO: handle cases when data falls into this category, eg. setting it as some generic/general object type

      const getObjectMetadataTypesResult = await this.getObjectMetadataTypes({organisationId: organisationId});
      if (getObjectMetadataTypesResult.status != 200) {
        throw Error(getObjectMetadataTypesResult.message);
      }
      const objectMetadataTypes = getObjectMetadataTypesResult.data;

      console.log("AA");

      const objectTypeDescriptions = this.createObjectTypeDescriptions(objectTypes, objectMetadataTypes); // Example output: {"product":{"name":"Product","description":"An item that is sold to users by teams (e.g. Apple Music is sold to users by Apple).","metadata":{"product_marketing_url":{"description":"Marketing URL","type":"string"},"product_types":{"description":"Product types","type":"array","items":{"type":"string"}},"product_ids":{"description":"In the form:\n   \"android/ios/...\"\n      -> \"id\"","type":"object"}}},"feedback":{"name":"Feedback","description":"Feedback from users about topics such as a product, service, experience or even the organisation in general.","metadata":{"feedback_author_name":{"description":"Name/username of the feedback's author.","type":"string"},"feedback_deal_size":{"description":"Estimated or actual deal size of the user submitting the feedback.","type":"number"}}}}
      console.log(`objectTypeDescriptions: ${JSON.stringify(objectTypeDescriptions)}`)

      const objectMetadataFunctionProperties = this.createObjectMetadataFunctionProperties(objectTypes, objectMetadataTypes); // Example output: {"product":{"product_marketing_url":{"description":"Marketing URL","type":"string"},"product_types":{"description":"Product types","type":"array","items":{"type":"string"}}},"feedback":{"feedback_author_name":{"description":"Author name: Name/username of the feedback's author.","type":"string"},"feedback_deal_size":{"description":"Deal size: Estimated or actual deal size of the user submitting the feedback.","type":"number"}}}
      console.log(`objectMetadataFunctionProperties: ${JSON.stringify(objectMetadataFunctionProperties)}`)

      console.log("a");

      // -----------Step 3: Determine which object type the data relates to----------- 
      this.nlpService.setMemberVariables({
        organisationId: organisationId,
        organisationData: organisationData,
        supportedObjectTypeIds: objectTypesIds,
        objectMetadataFunctionProperties: objectMetadataFunctionProperties,
      });
      console.log("b");
      await this.nlpService.initialiseClientCore();
      console.log("c");
      const sampleDataIn = "Hello, I'd like to provide some feedback about the app. It is mostly good, but I wish it could set timers.";
      const predictObjectTypeBeingReferencedResult = await this.nlpService.execute({
        text: `You MUST call the 'predictObjectTypeBeingReferenced' function to decide which object type the following data most likely relates to:\n${sampleDataIn}`,
        systemInstruction: config.VANILLA_SYSTEM_INSTRUCTION,
        functionUsage: "required",
        limitedFunctionSupportList: ["predictObjectBeingReferenced"],
        useLiteModels: true,
      });
      console.log("d");
      console.log("predictObjectTypeBeingReferenced:", predictObjectTypeBeingReferencedResult);
      if (predictObjectTypeBeingReferencedResult.status != 200) {
        throw Error(predictObjectTypeBeingReferencedResult.message);
      }
      const predictedObjectTypeBeingReferenced = predictObjectTypeBeingReferencedResult.data;
      this.nlpService.setMemberVariables({
        selectedObjectTypeId: predictedObjectTypeBeingReferenced,
      });

      // -----------Step 4: Process the data using the chosen object type's metadata----------- 
      const processDataUsingGivenObjectsMetadataStructureResult = await this.nlpService.execute({
        text: `You MUST call the 'processDataUsingGivenObjectsMetadataStructure' function to process the following data:\n${sampleDataIn}`,
        systemInstruction: config.VANILLA_SYSTEM_INSTRUCTION,
        functionUsage: "required",
        limitedFunctionSupportList: ["processDataUsingGivenObjectsMetadataStructure"],
        useLiteModels: true,
      });
      console.log("d");
      if (processDataUsingGivenObjectsMetadataStructureResult.status != 200) {
        throw Error(processDataUsingGivenObjectsMetadataStructureResult.message);
      }
      const objectData = processDataUsingGivenObjectsMetadataStructureResult.data;
      console.log("objectData:", objectData);

      const objectsUpdateResult = await this.storageService.updateRow({
        table: "objects",
        keys: {id: objectData.id},
        rowData: objectData,
        mayBeNew: true,
      });

      if (objectsUpdateResult.status != 200) {
        throw Error(objectsUpdateResult.message);
      }

      const result: FunctionResult = {
        status: 200,
        message: "Successfully processed and stored data.",
      };
      return result;

    } catch (error) {
      const result: FunctionResult = {
        status: 500,
        message: "Error in ProcessDataJob: " + error.message,
      };
      return result;
    }
  }

  private async inferOrganisation({ connection, data }: { connection: string; data: T }): Promise<FunctionResult> {
    try {
      let organisationId;
      if (data.organisationId) {
        // See if organisationId already stored in data (connections such as CSV upload support this)
        organisationId = feedbackData.organisationId;
      } else if (connection === "email") {
        // Infer organisationId from the domain of the sender if connection is email
        organisationId = data.recipient.split("@")[0];
      } else if (connection === "productfruits") {
        const mappingResult = await this.storageService.getRow({table: "connection_organisation_mapping", keys: {connection: connection, connection_id: data.data.projectCode}});
        organisationId = mappingResult.data.organisation_id;
      }
  
      if (organisationId) {
        const organisationDataResult = await this.storageService.getRow({table: "organisations", keys: {id: organisationId}});
        if (organisationDataResult.data) {
          console.log(`inferOrganisation successful with organisationId: ${organisationId}`)
          const result: FunctionResult = {
            status: 200,
            data: [organisationId, organisationDataResult.data],
          };
          return result;
        } else {
          throw new Error(`Unable to find organisationData for organisationId ${organisationId}`);
        }
      } else {
        throw new Error(`Unable to inferOrganisation from connection ${connection}`);
      }
    } catch (error) {
      const result: FunctionResult = {
        status: 500,
        message: error.message,
      };
      console.error(result.message);
      return result;
    }
  }

  private async getObjectTypes({ organisationId }: { organisationId: string }): Promise<FunctionResult> {
    try {
      console.log("buildStructuredObjectFunctions() called");
      const getObjectTypesResult = await this.storageService.getRows('object_types', {
        whereOrConditions: [
          { column: 'owner_organisation_id', operator: 'is', value: null }, // Include default entries where owner org not set
          { column: 'owner_organisation_id', operator: 'eq', value: organisationId }, // Include entries created by the org
        ],
      });
      if (getObjectTypesResult.status != 200) {
        return new Error(getObjectTypesResult.message);
      }
      const objectTypes = getObjectTypesResult.data;
      console.log(`objectTypes: ${JSON.stringify(objectTypes)}`)
      const result: FunctionResult = {
        status: 200,
        message: "Success running getObjectTypes",
        data: objectTypes,
      };
      return result;
    } catch(error) {
      const result: FunctionResult = {
        status: 500,
        message: error.message,
      };
      console.error(result.message);
      return result;
    }
  }

  private async getObjectMetadataTypes({ organisationId }: { organisationId: string }): Promise<FunctionResult> {
    try {
      console.log("getObjectMetadataTypes() called");
      const getObjectMetadataTypesResult = await this.storageService.getRows('object_metadata_types', {
        whereOrConditions: [
          { column: 'owner_organisation_id', operator: 'is', value: null }, // Include default entries where owner org not set
          { column: 'owner_organisation_id', operator: 'eq', value: organisationId }, // Include entries created by the org
        ],
      });
      if (getObjectMetadataTypesResult.status != 200) {
        return new Error(getObjectMetadataTypesResult.message);
      }
      const objectMetadataTypes = getObjectMetadataTypesResult.data;
      console.log(`objectMetadataTypes: ${JSON.stringify(objectMetadataTypes)}`)
      const result: FunctionResult = {
        status: 200,
        message: "Success running getObjectMetadataTypes",
        data: objectMetadataTypes,
      };
      return result;
    } catch(error) {
      const result: FunctionResult = {
        status: 500,
        message: error.message,
      };
      console.error(result.message);
      return result;
    }
  }

  private createObjectTypeDescriptions(objectTypes: any[], metadataTypes: any[]) {
    // Returns a map where the keys are each object type's ID, and the values are:
    // - The object type's name
    // - The object type's description
    // - The object type's metadata, which is a map containing metadata info, including cases where owner_object_type_id is null
    console.log(`createObjectTypeDescriptions called with objectTypes: ${JSON.stringify(objectTypes)} and metadataTypes: ${JSON.stringify(metadataTypes)}`);
  
    return objectTypes.reduce((result, objectType) => {
      // Find related metadata for the current object type or metadata with a null owner_object_type_id
      const relatedMetadata = metadataTypes.filter(
        (meta) => meta.owner_object_type_id === objectType.id || meta.owner_object_type_id === null
      );
  
      // Transform related metadata into the desired format
      const metadataMap = relatedMetadata.reduce((acc, meta) => {
        const description = meta.description || meta.name;
        const property: any = {
          description,
        };
  
        if (meta.is_array) {
          property.type = "array";
          property.items = { type: meta.data_type };
        } else {
          property.type = meta.data_type;
        }
  
        if (meta.enum) {
          property.enum = meta.enum; // Assuming `meta.enum` is an array of possible values
        }
  
        acc[meta.id] = property;
        return acc;
      }, {} as Record<string, any>);
  
      // Add the object type entry to the result map
      result[objectType.id] = {
        name: objectType.name,
        description: objectType.description,
        metadata: metadataMap,
      };
  
      return result;
    }, {} as Record<string, any>);
  }

  private createObjectMetadataFunctionProperties(
    // Creates a map where key is object id and value is a structured object describing for the AI how to create this object's metadata (if passed in as property data),
    // including metadata where owner_object_type_id is null and excluding those with allow_ai_update explicitly set to false.
    objectTypes: any[],
    metadataTypes: any[]
  ) {
    console.log(
      `createStructuredObjectFunctions called with objectTypes: ${JSON.stringify(
        objectTypes
      )} and metadataTypes: ${JSON.stringify(metadataTypes)}`
    );
  
    return objectTypes.reduce((acc, objectType) => {
      const relatedMetadata = metadataTypes.filter(
        (meta) =>
          (meta.owner_object_type_id === objectType.id || meta.owner_object_type_id === null) &&
          meta.allow_ai_update !== false // Skip if allow_ai_update is false
      );
  
      const properties = relatedMetadata.reduce((propAcc, meta) => {
        const description = meta.description
          ? `${meta.name}: ${meta.description}`
          : meta.name;
        const property: any = {
          description,
        };
  
        if (meta.is_array) {
          property.type = "array";
          property.items = { type: meta.data_type };
        } else {
          property.type = meta.data_type;
        }
  
        if (meta.enum) {
          property.enum = meta.enum; // Assuming `meta.enum` is an array of possible values
        }
  
        propAcc[meta.id] = property;
        return propAcc;
      }, {} as Record<string, any>);
  
      acc[objectType.id] = properties;
      return acc;
    }, {} as Record<string, Record<string, any>>);
  }

  
}