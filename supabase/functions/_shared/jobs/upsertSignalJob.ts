// import * as config from "../configs/index.ts";
// import { StorageService } from "../services/storage/storageService.ts";
// import { NlpService } from "../services/nlp/nlpService.ts";

// export class UpsertSignalJob<T> {
//   private readonly storageService: StorageService;
//   private readonly nlpService: NlpService;

//   constructor(
//     storageService: StorageService = new StorageService(),
//     nlpService: NlpService = new NlpService(),
//   ) {
//     this.storageService = storageService;
//     this.nlpService = nlpService;
//   }

//   async start({ triggerMessage, relevantData, organisationId, organisationData }: {
//     triggerMessage: string;
//     relevantData: any;
//     organisationId: string;
//     organisationData: any;
// }): Promise<any> {
//     console.log(`Upserting signal with triggerMessage: ${triggerMessage} and relevantData: ${relevantData}`);

//     // -----------Step 5: Process the data using the chosen object type's metadata----------- 
//     try {
//       await this.nlpService.initialiseClientCore();
//       // -----------Step 5a: Process the given data item----------- 
//       let processDataPrompt = `You MUST call the 'processDataUsingGivenObjectsMetadataStructure' function to process the following data:\n${config.stringify(dataContentsItem)}`;
//       if (dataIn.companyMetadata && dataIn.companyMetadata.dataDescription) {
//         processDataPrompt += `\n\nTo help, the member has provided the following context about the data:\n${dataIn.companyMetadata.dataDescription}`;
//       }
//       const processDataUsingGivenObjectsMetadataStructureResult = await this.nlpService.execute({
//         promptParts: [{"type": "text", "text": processDataPrompt}],
//         systemInstruction: config.VANILLA_SYSTEM_INSTRUCTION,
//         functionUsage: "required",
//         limitedFunctionSupportList: ["processDataUsingGivenObjectsMetadataStructure"],
//         useLiteModels: true,
//       });
//       console.log("d");
//       if (processDataUsingGivenObjectsMetadataStructureResult.status != 200) {
//         throw Error(processDataUsingGivenObjectsMetadataStructureResult.message);
//       }
//       const objectData = processDataUsingGivenObjectsMetadataStructureResult.data;
//       console.log("objectData:", objectData);
//       console.log(`✅ Completed "Step 5a: Process the given data item", with objectData: ${JSON.stringify(objectData)}`);

//       // -----------Step 5b: If object type demands a parent object, determine which object should be the parent-----------
//       if (dataIn.companyMetadata && dataIn.companyMetadata.parentObjectId) {
//         // Add immediately if explictly provided
//         objectData.parent_id = dataIn.companyMetadata.parentObjectId;
//         console.log(`✅ Completed "Step 5b: Auto assigned object's parent", with: parent id: ${objectData.parent_id}`);
//       } else {
//         console.log("aa");
//         const predictedObjectType = objectTypes.find(obj => obj.id === objectTypeId);
//         console.log(`predictedObjectType: ${predictedObjectType}`);
//         if (predictedObjectType && predictedObjectType.parent_object_type_id) {
//           console.log("Starting Step 5bi");
//           // Step 5bi: Retrieve all objects of this type
//           const parentObjectTypeId = predictedObjectType.parent_object_type_id;
//           console.log(`parentObjectTypeId: ${parentObjectTypeId}`);
//           console.log(`organisationId: ${organisationId}`);
//           const getPotentialParentObjectsResult = await this.storageService.getRows('objects', {
//             whereOrConditions: [
//               { column: 'owner_organisation_id', operator: 'is', value: null }, // Include default entries where owner org not set
//               { column: 'owner_organisation_id', operator: 'eq', value: organisationId }, // Include entries created by the org
//             ],
//             whereAndConditions: [
//               { column: 'related_object_type_id', operator: 'eq', value: parentObjectTypeId },
//             ],
//           });
//           const potentialParentObjects = getPotentialParentObjectsResult.data;
//           console.log(`potentialParentObjects: ${JSON.stringify(potentialParentObjects)}`);
//           console.log(`✅ Completed "Step 5bi: Retrieve all objects of this type", with: ${JSON.stringify(potentialParentObjects)}`);
//           if (potentialParentObjects && potentialParentObjects.length) {
//             // If there are actually some parent objects found
//             const potentialParentObjectsIds = potentialParentObjects.map(item => item.id); // List of strings of the ID of each object type
//             console.log("potentialParentObjectsIds", potentialParentObjectsIds);
//             this.nlpService.setMemberVariables({
//               selectedObjectsIds: potentialParentObjectsIds,
//             });
//             // Step 5bii: Predict the appropriate object's parent
//             console.log("1");
  
//             const objectDataCopyLimitedData = structuredClone(objectData); // Create a deep copy
//             delete objectDataCopyLimitedData.id; // Remove the `id` key to help avoid the NLP getting confused and choosing this id as the chosen parent id
//             delete objectDataCopyLimitedData.owner_organisation_id; // Remove the `owner_organisation_id` key to help avoid the NLP getting confused and taking into account the org name unecessarily
  
//             const predictObjectParentResult = await this.nlpService.execute({
//               promptParts: [{"type": "text", "text": `You MUST call the 'predictObjectParent' function to decide which object of type ${parentObjectTypeId} is the most appropriate parent for the given object.
//               \n\nObject that needs a parent:\n${JSON.stringify(objectDataCopyLimitedData)}
//               \n\nObjects that can be chosen from:\n${JSON.stringify(potentialParentObjects)}`}],
//               systemInstruction: config.VANILLA_SYSTEM_INSTRUCTION,
//               functionUsage: "required",
//               limitedFunctionSupportList: ["predictObjectParent"],
//               useLiteModels: true,
//             });
//             console.log("2");
//             console.log("predictObjectParentResult:", predictObjectParentResult);
//             console.log(`✅ Completed "Step 5bii: Predict the appropriate object's parent", with: ${JSON.stringify(predictObjectParentResult)}`)
//             if (predictObjectParentResult.status == 200 && predictObjectParentResult.data) {
//               // Step 5biii: Assign a parent object assuming one could be found
//               objectData.parent_id = predictObjectParentResult.data;
//               console.log(`✅ Completed "Step 5biii: Assign a parent object assuming one could be found", with: ${JSON.stringify(objectData)}`);
//             }
//           } else {
//             console.log("Not adding parent to object as no objects of suitable type found");
//           }
//         } else {
//           console.log(`Not adding parent to object as predictedObjectType: ${predictedObjectType} and/or predictedObjectType.parent_object_type_id: ${predictedObjectType.parent_object_type_id}`);
//         }
//       }
      
//       // -----------Step 5c: Save object as appropriate-----------
//       if (dryRun) {
//         // Not actually saving data if dry run, just returning what would be saved
//         console.log(`Dry run, so just adding objectData: ${JSON.stringify(objectData)}`);
//         dataContentsOutcomes.push(objectData);
//       } else {
//         // Update the object
//         console.log(`Updating object data in DB with objectData: ${JSON.stringify(objectData)}`);
//         const objectUpdateResult = await this.storageService.updateRow({
//           table: "objects",
//           keys: {id: objectData.id},
//           rowData: objectData,
//           nlpService: this.nlpService,
//           mayAlreadyExist: false, // Change this to true if in future it is decided that if dupe data is uploaded, we should implement logic to merge rather than just add new
//         });
//         if (objectUpdateResult.status != 200) {
//           throw Error(objectUpdateResult.message);
//         }

//         // Update the object's parent, if it exists, with new child_id value
//         if (objectData.parent_id) {
//           console.log("Update the object's parent with new child_id value");
//           const objectParentUpdateResult = await this.storageService.updateRow({
//             table: "objects",
//             keys: {id: objectData.parent_id},
//             rowData: {
//               child_ids: {[objectData.related_object_type_id]: [objectData.id]},
//             },
//             nlpService: this.nlpService,
//             mayAlreadyExist: true,
//           });
//           if (objectParentUpdateResult.status != 200) {
//             throw Error(objectParentUpdateResult.message);
//           }
//         } else {
//           console.log("No parent so not updating any other object");
//         }
//       }
//       console.log(`✅ Completed "Step 5c: Save object as appropriate", with: dryRun: ${dryRun}`);
//     }
//     catch (error) {
//       dataContentsOutcomes.push(`Failed to process: ${config.stringify(dataContentsItem)}. Error: ${error.message}`);
//     }

//     const result: FunctionResult = {
//       status: 200,
//       message: "Successfully processed and stored data.",
//       data: dataContentsOutcomes,
//     };
//     return result;
//   }

//   private async inferOrganisation({ connection, dataIn }: { connection: string; dataIn: T }): Promise<FunctionResult> {
//     try {
//       let organisationId;
//       if (dataIn.companyMetadata && dataIn.companyMetadata.organisationId) {
//         // See if organisationId already stored in dataIn (connections such as CSV upload support this)
//         organisationId = dataIn.companyMetadata.organisationId;
//       } else if (connection === "email") {
//         // Infer organisationId from the domain of the sender if connection is email
//         organisationId = dataIn.recipient.split("@")[0];
//       } else if (connection === "productfruits") {
//         const mappingResult = await this.storageService.getRow({table: "connection_organisation_mapping", keys: {connection: connection, connection_id: dataIn.data.projectCode}});
//         organisationId = mappingResult.data.organisation_id;
//       }
  
//       if (organisationId) {
//         const organisationDataResult = await this.storageService.getRow({table: "organisations", keys: {id: organisationId}});
//         if (organisationDataResult.data) {
//           console.log(`inferOrganisation successful with organisationId: ${organisationId}`)
//           const result: FunctionResult = {
//             status: 200,
//             data: [organisationId, organisationDataResult.data],
//           };
//           return result;
//         } else {
//           throw new Error(`Unable to find organisationData for organisationId ${organisationId}`);
//         }
//       } else {
//         throw new Error(`Unable to inferOrganisation from connection ${connection}`);
//       }
//     } catch (error) {
//       const result: FunctionResult = {
//         status: 500,
//         message: `❌ ${error.message}`,
//       };
//       console.error(result.message);
//       return result;
//     }
//   }

//   private async getObjectTypes({ organisationId }: { organisationId: string }): Promise<FunctionResult> {
//     try {
//       console.log("buildStructuredObjectFunctions() called");
//       const getObjectTypesResult = await this.storageService.getRows('object_types', {
//         whereOrConditions: [
//           { column: 'owner_organisation_id', operator: 'is', value: null }, // Include default entries where owner org not set
//           { column: 'owner_organisation_id', operator: 'eq', value: organisationId }, // Include entries created by the org
//         ],
//       });
//       if (getObjectTypesResult.status != 200) {
//         return new Error(getObjectTypesResult.message);
//       }
//       const objectTypes = getObjectTypesResult.data;
//       console.log(`objectTypes: ${JSON.stringify(objectTypes)}`)
//       const result: FunctionResult = {
//         status: 200,
//         message: "Success running getObjectTypes",
//         data: objectTypes,
//       };
//       return result;
//     } catch(error) {
//       const result: FunctionResult = {
//         status: 500,
//         message: `❌ ${error.message}`,
//       };
//       console.error(result.message);
//       return result;
//     }
//   }

//   private async getObjectMetadataTypes({ organisationId }: { organisationId: string }): Promise<FunctionResult> {
//     try {
//       console.log("getObjectMetadataTypes() called");
//       const getObjectMetadataTypesResult = await this.storageService.getRows('object_metadata_types', {
//         whereOrConditions: [
//           { column: 'owner_organisation_id', operator: 'is', value: null }, // Include default entries where owner org not set
//           { column: 'owner_organisation_id', operator: 'eq', value: organisationId }, // Include entries created by the org
//         ],
//       });
//       if (getObjectMetadataTypesResult.status != 200) {
//         return new Error(getObjectMetadataTypesResult.message);
//       }
//       const objectMetadataTypes = getObjectMetadataTypesResult.data;
//       console.log(`objectMetadataTypes: ${JSON.stringify(objectMetadataTypes)}`)
//       const result: FunctionResult = {
//         status: 200,
//         message: "Success running getObjectMetadataTypes",
//         data: objectMetadataTypes,
//       };
//       return result;
//     } catch(error) {
//       const result: FunctionResult = {
//         status: 500,
//         message: `❌ ${error.message}`,
//       };
//       console.error(result.message);
//       return result;
//     }
//   }

//   private async getFieldTypes(): Promise<FunctionResult> {
//     try {
//       console.log("getFieldTypes() called");
//       const getFieldTypesResult = await this.storageService.getRows('field_types', {
//       });
//       if (getFieldTypesResult.status != 200) {
//         return new Error(getFieldTypesResult.message);
//       }
//       const fieldTypes = getFieldTypesResult.data;
//       console.log(`fieldTypes: ${JSON.stringify(fieldTypes)}`)
//       const result: FunctionResult = {
//         status: 200,
//         message: "Success running getFieldTypes",
//         data: fieldTypes,
//       };
//       return result;
//     } catch(error) {
//       const result: FunctionResult = {
//         status: 500,
//         message: `❌ ${error.message}`,
//       };
//       console.error(result.message);
//       return result;
//     }
//   }

//   private async getDictionaryTerms(): Promise<FunctionResult> {
//     try {
//       console.log("getDictionaryTerms() called");
//       const getDictionaryTermsResult = await this.storageService.getRows('dictionary_terms', {
//       });
//       if (getDictionaryTermsResult.status != 200) {
//         return new Error(getDictionaryTermsResult.message);
//       }
//       const dictionaryTerms = getDictionaryTermsResult.data;
//       console.log(`dictionaryTerms: ${JSON.stringify(dictionaryTerms)}`)
//       const result: FunctionResult = {
//         status: 200,
//         message: "Success running getDictionaryTerms",
//         data: dictionaryTerms,
//       };
//       return result;
//     } catch(error) {
//       const result: FunctionResult = {
//         status: 500,
//         message: `❌ ${error.message}`,
//       };
//       console.error(result.message);
//       return result;
//     }
//   }

//   private createObjectTypeDescriptions(objectTypes: any[], metadataTypes: any[]) {
//     // TODO: possibly remove this and reuse createObjectMetadataFunctionProperties instead?
//     // Returns a map where the keys are each object type's ID, and the values are:
//     // - The object type's name
//     // - The object type's description
//     // - The object type's metadata, which is a map containing metadata info, including cases where related_object_type_id is null
//     console.log(`createObjectTypeDescriptions called with objectTypes: ${JSON.stringify(objectTypes)} and metadataTypes: ${JSON.stringify(metadataTypes)}`);
  
//     return objectTypes.reduce((result, objectType) => {
//       // Find related metadata for the current object type or metadata with a null related_object_type_id
//       const relatedMetadata = metadataTypes.filter(
//         (meta) => meta.related_object_type_id === objectType.id || meta.related_object_type_id === null
//       );
  
//       // Transform related metadata into the desired format
//       const metadataMap = relatedMetadata.reduce((acc, meta) => {
//         const description = meta.description || meta.name;
//         const property: any = {
//           description,
//         };
  
//         property.fieldType = meta.field_type_id; // TODO: check this is displaying as expected and consider also/instead of including the underlying data type
  
  
//         acc[meta.id] = property;
//         return acc;
//       }, {} as Record<string, any>);
  
//       // Add the object type entry to the result map
//       result[objectType.id] = {
//         name: objectType.name,
//         description: objectType.description,
//         metadata: metadataMap,
//       };
  
//       return result;
//     }, {} as Record<string, any>);
//   }

//   private createObjectMetadataFunctionProperties(
//     objectTypes: any[],
//     metadataTypes: any[],
//     fieldTypes: any[],
//     dictionaryTerms: any[]
//   ): [Record<string, Record<string, any>>, Record<string, string[]>] {
//     // Creates two maps:  
//     // 1. `objectMetadataFunctionProperties` - A map where the key is the object ID and the value is a structured object describing for the AI how to create this object's metadata, including metadata where `related_object_type_id` is `null` and excluding those with `allow_ai_update` explicitly set to `false`.  
//     // 2. `objectMetadataFunctionPropertiesRequiredIds` - A map where the key is the metadata ID and the value is a list of all the metadata type ids where `is_required` property is `true` (if allow_ai_update marked as false, these will already be exlcuded from this even if is_required is set to true)
//     console.log(
//       `createStructuredObjectFunctions called with objectTypes: ${JSON.stringify(
//         objectTypes
//       )} and metadataTypes: ${JSON.stringify(metadataTypes)}
//        and fieldTypes: ${JSON.stringify(fieldTypes)}
//         and dictionaryTerms: ${JSON.stringify(dictionaryTerms)}`
//     );
  
//     // Initialize the result maps
//     const objectMetadataFunctionProperties: Record<string, Record<string, any>> = {};
//     const objectMetadataFunctionPropertiesRequiredIds: Record<string, string[]> = {};
  
//     // Loop through each objectType
//     objectTypes.forEach((objectType) => {
//       // Filter metadata types relevant to this objectType
//       const relatedMetadata = metadataTypes.filter(
//         (meta) =>
//           (meta.related_object_type_id === objectType.id || meta.related_object_type_id === null) &&
//           meta.allow_ai_update !== false // Skip if allow_ai_update is false
//       );
  
//       // Initialize properties and required IDs
//       const properties: Record<string, any> = {};
//       const requiredIds: string[] = [];
  
//       // Populate properties and requiredIds
//       relatedMetadata.forEach((meta) => {
//         if (meta.allow_ai_update) {
//           console.log(`Adding metadata objectType.id: ${objectType.id}, meta: ${JSON.stringify(meta)}`);
//           const property: any = {};
//           let description = meta.description
//             ? `${meta.name}: ${meta.description}`
//             : meta.name;
//           if (meta.max_value) {
//             description += `\nThe max value is: ${meta.max_value}`;
//           }
//           if (meta.dictionary_term_type) {
//             // 1. List of IDs matching the given type.
//             const idsMatchingType = dictionaryTerms
//             .filter(term => term.type === meta.dictionary_term_type)
//             .map(term => term.id);

//             console.log("IDs matching type:", idsMatchingType);

//             // 2. List of maps with id and description for matching items.
//             const mapsMatchingType = dictionaryTerms
//             .filter(term => term.type === meta.dictionary_term_type)
//             .map(term => ({ id: term.id, description: term.description }));

//             console.log("Maps matching type:", mapsMatchingType);

//             description += `\nDescriptions for the enums are: ${JSON.stringify(mapsMatchingType)}`;

//             property.enum = idsMatchingType;
//           }

//           property.description = description;
    
//           const fieldTypeMap = fieldTypes.find((entry) => entry.id === meta.field_type_id);
//           property.type = fieldTypeMap.data_type; // Assign data type by retrieving the data type based on the matching field_type_id
//           if (fieldTypeMap.is_array) {
//             // If true, surround property within an array structure
//             const propertyArrContainer: any = {
//               type: "array",
//               description: `Array of ${meta.name} items`,
//               items: property,
//             };
//             properties[meta.id] = propertyArrContainer;
//           } else {
//             properties[meta.id] = property;
//           }
//           console.log(`properties[meta.id] (where meta.id=${meta.id}) is now set to: ${JSON.stringify(properties[meta.id])}`)

//           // Add to requiredIds if is_required is true
//           if (meta.is_required) {
//             requiredIds.push(meta.id);
//           }
//         } else {
//           console.log(`Skipping metadata as allow_ai_update is false for objectType.id: ${objectType.id}, meta: ${JSON.stringify(meta)}`);
//         }
//       });
  
//       // Assign to the maps
//       console.log(`For objectType.id: ${objectType.id}, properties: ${JSON.stringify(properties)}`);
//       objectMetadataFunctionProperties[objectType.id] = properties;
//       objectMetadataFunctionPropertiesRequiredIds[objectType.id] = requiredIds;
//     });
  
//     // Return both maps
//     return [objectMetadataFunctionProperties, objectMetadataFunctionPropertiesRequiredIds];
//   }
// }