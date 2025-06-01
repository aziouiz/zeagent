import { ChatOpenAI } from "@langchain/openai";
import { ChatAnthropic } from "@langchain/anthropic";
import { ChatOllama } from "@langchain/ollama";
import dotenv from "dotenv";

dotenv.config();

export function getLLMModel() {
    const vendor = process.env.LLM_VENDOR;
    const model = process.env.LLM_MODEL;
    
    if (!vendor || !model) {
        throw new Error("Please set both LLM_VENDOR and LLM_MODEL environment variables");
    }

    switch (vendor.toUpperCase()) {
        case "OPEN_AI":
            if (!process.env.OPENAI_API_KEY) {
                throw new Error("Please set the OPENAI_API_KEY environment variable for OpenAI");
            }
            return new ChatOpenAI({
                modelName: model,
                temperature: 0,
                configuration: {
                    apiKey: process.env.OPENAI_API_KEY,
                },
            });

        case "ANTHROPIC":
            if (!process.env.ANTHROPIC_API_KEY) {
                throw new Error("Please set the ANTHROPIC_API_KEY environment variable for Anthropic");
            }
            return new ChatAnthropic({
                modelName: model,
                temperature: 0,
                apiKey: process.env.ANTHROPIC_API_KEY,
            });

        case "OLLAMA":
            return new ChatOllama({
                model: model,
                temperature: 0,
                baseUrl: process.env.OLLAMA_BASE_URL || "http://localhost:11434",
            });

        default:
            throw new Error(`Unsupported LLM vendor: ${vendor}. Supported vendors: OPEN_AI, ANTHROPIC, OLLAMA`);
    }
}
