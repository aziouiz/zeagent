import { MultiServerMCPClient } from "@langchain/mcp-adapters";
import { ChatOpenAI } from "@langchain/openai";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { MemorySaver } from "@langchain/langgraph";
import { v4 as uuidv4 } from "uuid";
import readline from "readline";
import dotenv from "dotenv";
import {trimMessages} from "@langchain/core/messages";
dotenv.config();

if (!process.env.OPENAI_API_KEY) {
    console.error("Please set the OPENAI_API_KEY environment variable.");
    process.exit(1);
}

const client = new MultiServerMCPClient({
    throwOnLoadError: true,
    prefixToolNameWithServerName: true,
    additionalToolNamePrefix: "mcp",
    useStandardContentBlocks: true,
    mcpServers: {
        oracle: {
            transport: "stdio",
            command: "npx",
            args: [
                "-y",
                "@zemcp/oracle@1.0.2"
            ],
            env: {
                DB_USER: "sys",
                DB_PASSWORD: "password",
                DB_CONNECT_STRING: "localhost:1521/XEPDB1",
                DB_PRIVILEGE: "SYSDBA",
                DEBUG_SQL: "true",
                LOG_FILE: "/home/u0/Documents/zeagent/pino-logs/oracle.log",
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

const model = new ChatOpenAI({
    modelName: "gpt-4o",
    temperature: 0,
    configuration: {
        apiKey: process.env.OPENAI_API_KEY,
    },
});

const invokeConfig = { configurable: { thread_id: uuidv4() } };

const trimmer = trimMessages({
    strategy: "last",
    maxTokens: 20,
    startOn: 'human',
    tokenCounter: (msgs) => msgs.length,
});

const systemMsg = 'each time I type "w" I want you to check if there are any problems in the oracle-xe:21.3.0 (you are user sa). you are free to perform the checks you need.' +
    'if some checks fail more than once, skip them. change the checks from time to time, be creative. you are a oracle expert.' +
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