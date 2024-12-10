// Exporting functions and declarations
export async function initialiseFunctions(baseInstance: any) {
  console.log(`baseInstance.parent.supportedObjectTypeNames: ${baseInstance.parent.supportedObjectTypeNames}`);
  return {
    predictObjectTypeBeingReferenced: {
      declaration: {
        type: "function",
        function: {
          name: "predictObjectTypeBeingReferenced",
          description: "Predict which type of object is being referenced based on input.",
          parameters: {
            type: "object",
            strict: true,
            properties: {
              predictedObjectTypeName: {
                type: "string",
                description: "Name of estimated object type, or 'unknown' if none apply.",
                enum: baseInstance.parent.supportedObjectTypeNames
              },
            },
            required: ["predictedObjectTypeName"],
            additionalProperties: false,
          },
        }
      },
      implementation: async ({ predictedObjectTypeName }: { predictedObjectTypeName: string }) => {
        try {
          console.log(`predictObjectBeingReferenced called with: ${predictedObjectTypeName}`);
          const predictedObjectTypeNameProcessed = predictedObjectTypeName === "unknown" ? null : predictedObjectTypeName;
          const result: FunctionResult = {
            status: 200,
            message: "Predicted object's type",
            data: predictedObjectTypeNameProcessed,
          };
          return result;
        } catch (error) {
          const result: FunctionResult = {
            status: 500,
            message: "Error in predictProductBeingReferenced: " + error.message,
          };
          return result;
        }
      },
    },
  };
};
