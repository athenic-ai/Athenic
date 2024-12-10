import { NlpFunctionsBase } from "./nlpFunctionsBase.ts";
import { StorageService } from "../storage/storageService.ts";
// import TasksPlugin from "../tasks/tasksPlugin";
import OpenAI from "npm:openai"
import * as config from "../../configs/index.ts";

interface MemberVariables {
  tasksService?: any;
  organisationId?: string;
  organisationData?: Record<string, unknown>;
  memberFire?: any;
  memberData?: any;
  threadId?: string;
  selectedProductName?: string;
  selectedPlatformName?: string;
  processingDryRun?: any;
}

interface ExecuteParams {
  text: string;
  systemInstruction: string;
  chatHistory?: Array<{ role: string; content: string }>;
  temperature?: number;
  functionUsage?: string;
  limitedFunctionSupportList?: any[];
  interpretFuncCalls?: boolean;
  useLiteModels?: boolean;
}

interface ExecuteThreadParams {
  text: string;
  systemInstruction: string;
}

export class NlpService {
  private nlpFunctionsBase: NlpFunctionsBase;
  private storageService: StorageService;
  // private tasksPlugin: TasksPlugin;
  // private tasksService: any | null = null;
  private clientCore: OpenAI | null = null;
  private clientTextEmbedding: any | null = null;
  private adminSettings: any | null = null;
  private organisationId: string | null = null;
  private organisationData: Record<string, unknown> | null = null;
  // private productDataAll: Record<string, any> = {};
  private memberFire: any | null = null;
  private memberData: any | null = null;
  // private threadId: string | null = null;
  private supportedObjectTypeNames: string[] = [];
  // private defaultProductName: string | null = null;
  // private selectedProductName: string | null = null;
  // private tasksMap: Record<string, any> = {};
  // private supportedPlatformNames: string[] = ["email"];
  // private selectedPlatformName: string | null = null;
  // private dataIfFeedbackFromUser: any | null = null;
  private currentFunctionSupportList: any[] | null = null;
  private functionDeclarations: any[] | null = null;
  // private selectedNlp: string = "openai";
  // private processingDryRun: any = config.TriBool.UNKNOWN;

  constructor(
    storageService: StorageService = new StorageService(),
    // tasksPlugin: TasksPlugin = new TasksPlugin()
  ) {
    this.nlpFunctionsBase = new NlpFunctionsBase(this);
    this.storageService = storageService;
    // this.tasksPlugin = tasksPlugin;
  }

  setMemberVariables({
    organisationId,
    organisationData,
    memberFire,
    memberData,
    supportedObjectTypeNames,
  }: MemberVariables) {
    console.log("setMemberVariables called");
    if (organisationId) this.organisationId = organisationId;
    if (organisationData) this.organisationData = organisationData;
    if (memberFire) this.memberFire = memberFire;
    if (memberData) this.memberData = memberData;
    if (supportedObjectTypeNames) this.supportedObjectTypeNames = supportedObjectTypeNames;
  }

  async initialiseClientCore(apiKey: string): Promise<void> {
    console.log("initialiseClientCore called");
    try {
      // this.clientCore = new OpenAI(Deno.env.get('OPENAI_API_KEY')); Use this if calling OpenAI's API directly
      this.clientCore = new OpenAI({
        baseURL: "https://openrouter.ai/api/v1",
        apiKey: Deno.env.get('OPENROUTER_API_KEY'),
        // defaultHeaders: {
        //   "HTTP-Referer": $YOUR_SITE_URL, // Optional, for including your app on openrouter.ai rankings.
        //   "X-Title": $YOUR_APP_NAME, // Optional. Shows in rankings on openrouter.ai.
        // }
      })
      console.log("OpenAI client initialised successfully");
    } catch (error) {
      console.error("Error initializing OpenAI client:", error);
      throw error;
    }
  }

  async execute({
    text,
    systemInstruction,
    chatHistory = [],
    temperature = 0,
    functionUsage = "auto", // Options: none, auto, required
    limitedFunctionSupportList,
    interpretFuncCalls = false,
    useLiteModels = true,
  }: ExecuteParams): Promise<any> {
    if (!text) {
      throw new Error("No text provided for NLP analysis");
    }

    console.log(`functionUsage: ${functionUsage}`);

    try {
      console.log(`NLP called with prompt: ${text}\n and chat history: ${JSON.stringify(chatHistory)}`);
      const models = useLiteModels
        ? config.NLP_MODELS_LITE
        : config.NLP_MODELS_FULL;

      if (!this.functionDeclarations || limitedFunctionSupportList !== this.currentFunctionSupportList) {
        await this.nlpFunctionsBase.loadFunctions();
        this.functionDeclarations = this.nlpFunctionsBase.getAllFunctionDeclarations();
        this.currentFunctionSupportList = limitedFunctionSupportList;
      }

      const messages = [
        { role: "system", content: systemInstruction },
        { role: "user", content: text },
      ];

      const initialCreateResult = await this.clientCore!.chat.completions.create({
        models,
        messages,
        tools: this.functionDeclarations,
        tool_choice: functionUsage, // NOTE: not supported by a number of models
        // provider: { // TODO: enable this before going to production
        //   data_collection: "deny"
        // },
      });
      const createResMessage = initialCreateResult.choices[0].message;

      if (createResMessage.tool_calls) {
        console.log("tool_calls requested with current functions:", this.nlpFunctionsBase.nlpFunctions); // FYI can't JSON parse this specific var, so to show it, need to do it like this
        const functionResultsData = [];
        for (const toolCall of createResMessage.tool_calls) {
          if (toolCall.type === "function") {
            const functionName = toolCall.function.name;
            const functionArgs = JSON.parse(toolCall.function.arguments);
            console.log(`Function called: ${functionName} with args: ${JSON.stringify(functionArgs)}`);
            const chosenFunctionImplementation = this.nlpFunctionsBase.nlpFunctions[functionName].implementation;
            const functionResult = await chosenFunctionImplementation(functionArgs);
            functionResultsData.push({ name: functionName, functionResult });
          }
        }

        if (interpretFuncCalls) {
          const referencesList: any[] = [];
          for (const functionResultData of functionResultsData) {
            if (functionResultData.functionResult.references) {
              referencesList.push(functionResultData.functionResult.references);
            }
            const result = typeof functionResultData.result === "object"
              ? JSON.stringify(functionResultData.result)
              : functionResultData.result;

            messages.push({
              role: "assistant",
              content: `Response after running function "${functionResultData.name}": ${result}`,
            });
          }

          const interpretedCreateResult = await this.clientCore!.chat.completions.create({
            models,
            messages,
            tools: this.functionDeclarations,
          });

          if (referencesList.length > 0) {
            const referencesStr = referencesList.map((ref, idx) => `<${ref}|here>`).join(", ");
            return { result: `${interpretedCreateResult.response.text()}\n_References: ${referencesStr}._` };
          } else {
            return { result: interpretedCreateResult.response.text() };
          }
        } else {
          return functionResultsData;
        }
      } else {
        console.log("No function calls were made by the model.");
        return { result: createResMessage.content };
      }
    } catch (error) {
      console.error("Error during NLP execution:", error);
      return "Oops! I was unable to get a result. Please try again shortly.";
    }
  }

  sleep(time: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, time));
  }
}