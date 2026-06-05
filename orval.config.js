import "dotenv/config";
import process from "node:process";

export default {
  api: {
    input: process.env.SWAGGER_URL,
    output: {
      target: "./src/api/generated.ts",
      client: "react-query",
      httpClient: "axios",
      mock: false,
      override: {
        mutator: {
          path: "./src/services/api.ts",
          name: "mutationInstance",
        },
      },
    },
  },
};
