# MCP Guide

This file explains Model Context Protocol, or MCP, in simple terms.

## What MCP Is

MCP is a standard way for an AI app to talk to external tools.

Without MCP, every app invents its own way to connect to tools like:

- file systems
- databases
- GitHub
- Slack
- custom internal APIs

With MCP, those tools are exposed in a common shape, so an AI client can discover and call them in a predictable way.

## The Two Main Parts

### MCP client

The MCP client is the app that wants to use tools.

It does things like:

- connect to one or more MCP servers
- ask what tools are available
- send tool calls
- read tool results

Examples of MCP clients:

- a desktop AI app
- a code editor assistant
- a terminal assistant
- any custom app that wants to use tools

### MCP server

The MCP server is the process that provides tools.

It does things like:

- define the available tools
- describe the input each tool expects
- run the tool logic
- return results back to the client

Examples of MCP servers:

- a local script that reads files
- a server that queries a database
- a bridge to GitHub or Slack
- a custom internal service you write

## How They Talk

The client asks the server:

1. What tools do you have?
2. What inputs do they need?
3. Please run this tool with these arguments
4. Return the result

The server responds with structured data, not just free-form text.

That structure is what lets the AI use tools safely and reliably.

## How To Provide Custom Tools With MCP

If you want me to use your own tools, you usually do this:

1. Write an MCP server.
2. Expose the tools you want available.
3. Run that server locally or host it somewhere.
4. Connect your AI client to that server.

Your server can expose almost anything that can be expressed as a function:

- `search_docs(query)`
- `create_ticket(title, description)`
- `get_customer(id)`
- `run_sql(query)`
- `deploy_service(service_name)`

The important part is that each tool has:

- a name
- input schema
- a result format

## What Runs Where

There are usually three separate things:

- the model
- the client app
- the MCP server

The model:

- reasons about what tool to use
- does not directly manage the transport

The client app:

- owns the chat/session
- connects to MCP servers
- sends tool requests

The MCP server:

- runs the actual tool code
- may call APIs, databases, files, or local processes

## In My Case

In this conversation, think of it like this:

- **I am acting like the MCP client side**
- **your custom tool provider would be the MCP server**
- **the model is the reasoning layer that decides when to ask for a tool**

So if you give me a custom MCP server, I can use the tools it exposes.

If you are asking what I "become":

- I do **not** become the server
- I behave like the client that requests tools from the server

## Simple Mental Model

Think of MCP like this:

- **client** = the app that asks for help
- **server** = the app that provides tools
- **model** = the brain that decides what to ask for

## Example

If you build an MCP server with a tool called `search_docs`, then a client can do this:

1. Discover `search_docs`
2. Send `{ "query": "how do retries work?" }`
3. Receive matching docs
4. Feed that result back into the model

The model then uses that result to answer the user.

## Why MCP Is Useful

MCP helps because it gives you:

- a standard integration format
- reusable tools across different clients
- less custom glue code
- clearer boundaries between AI and tool execution

## Practical Rule

If you are building a tool:

- put the tool logic in an MCP server

If you are building an AI app:

- make the app an MCP client

If you are using both:

- the client discovers and calls tools
- the server executes them

## Short Version

MCP is a common language between AI apps and tools.

You write a server to expose tools.

The AI app is the client that connects to that server.

In this setup, I behave like the client side, and your custom tool host behaves like the server side.
