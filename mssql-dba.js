import { MultiServerMCPClient } from "@langchain/mcp-adapters";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { MemorySaver } from "@langchain/langgraph";
import { v4 as uuidv4 } from "uuid";
import readline from "readline";
import dotenv from "dotenv";
import {trimMessages} from "@langchain/core/messages";
import { getLLMModel } from "./llm.js";
dotenv.config();

const client = new MultiServerMCPClient({
    throwOnLoadError: true,
    prefixToolNameWithServerName: true,
    additionalToolNamePrefix: "mcp",
    useStandardContentBlocks: true,
    mcpServers: {
        mssql: {
            transport: "stdio",
            command: "npx",
            args: [
                "-y",
                "@zemcp/mssql@1.0.2"
            ],
            env: {
                DB_HOST: "localhost",
                DB_PORT: "1433",
                DB_NAME: "master",
                DB_USER: "sa",
                DB_PASSWORD: "YourStrong@Passw0rd",
                DEBUG_SQL: "true",
                LOG_FILE: "/home/u0/Documents/zeagent/pino-logs/mssql.log",
            },
            restart: {
                enabled: true,
                maxAttempts: 3,
                delayMs: 1000,
            },
        },
    },
});

const tools = await client.getTools();

const model = getLLMModel();

const invokeConfig = { configurable: { thread_id: uuidv4() } };

const trimmer = trimMessages({
    strategy: "last",
    maxTokens: 20,
    startOn: 'human',
    tokenCounter: (msgs) => msgs.length,
});

const systemMsg = 'each time I type "w" I want you to check if there are any problems in the sql server 2022 (you are user sa). you are free to perform the checks you need.' +
    'if some checks fail more than once, skip them. change the checks from time to time, be creative. you are a mssql expert.' +
    'if you find an issue, do not act on it, ask me and if I allow then do the necessary.';

const agent = createReactAgent({
    llm: model,
    tools,
    checkpointSaver: new MemorySaver(),
    prompt: async (state, config) => {
        const trimmedMessages = await trimmer.invoke(state.messages);
        return [
            {
                role: "system",
                content: systemMsg
            },
            ...trimmedMessages
        ];
    },
});

let isInvoking = false; // Semaphore flag

const invokeAgent = async (userMessage) => {
    if (isInvoking) {
        console.log("Agent is busy, please wait...");
        return;
    }

    isInvoking = true;
    try {
        const response = await agent.invoke({
            messages: [{ role: "user", content: userMessage }],
        }, invokeConfig);

        const lastMsg = response.messages[response.messages.length - 1];
        console.log("Agent response:", lastMsg.content);
        return lastMsg;

    } catch (error) {
        console.error("Error during agent execution:", error);
        if (error.name === "ToolException") {
            console.error("Tool execution failed:", error.message);
        }
    } finally {
        isInvoking = false;
    }
};

const sleep = async (ms) => {
    return new Promise(resolve => setTimeout(resolve, ms));
};

const monitor = async () => {
    process.on("exit", async () => {
        console.log("Process exiting, closing client...");
        await client.close();
    });

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    rl.on("line", async (input) => {
        console.log(`Received user prompt: ${input}`);
        await invokeAgent(input);
    });

    while (true) {
        console.log("Invoking agent with message 'w'...");
        await invokeAgent("w");
        await sleep(60*1000);
    }
};

monitor();