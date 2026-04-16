## Rule
- Alway run the typecheck and the lint command on evey file that you edit 
- Alway add the Jsdocs commet to the new function or the types or schema that you have created while writeing the commets , keep the language simple and like this function does this and this is the shape of the request that we are expecting
- Alway use bun not npm or pnpm
- When writing the plan to edit or change file , i suggest you to first read those particualr files so that you actaully know what is the current state they are in so you can plan thing better , instead of assuming thing
- When asked about editing a file for UI change always use the .agents/skills/frontend-design and .agents/skills/emil-design-eng
- When every in the UI any thing clickable must have cursor-pointer

## Core Priorities

1. Performance first.
2. Reliability first.
3. Keep behavior predictable under load and during failures (session restarts, reconnects, partial streams).

If a tradeoff is required, choose correctness and robustness over short-term convenience.

## Maintainability

Long term maintainability is a core priority. If you add new functionality, first check if there is shared logic that can be extracted to a separate module. Duplicate logic across multiple files is a code smell and should be avoided. Don't be afraid to change existing code. Don't take shortcuts by just adding local logic to solve a problem.

<!-- btca-cli-start -->
**Never run this CLI command in the sandbox**
In any thread or conversation , if we are trying to add a new feauther or decide on how should we do things like standerize a schema or in which direction we should head you alway to need to run this command and tell me first how are these two package doing things pi_mono and tanstack_ai

btca ask -r resource -q "your question"

resource -> pi-mono , tanstack_ai , t3code
<!-- btca-cli-end -->

<!-- convex-ai-start -->
This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read `convex/_generated/ai/guidelines.md` first** for important guidelines on how to correctly use Convex APIs and patterns. The file contains rules that override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running `npx convex ai-files install`.
<!-- convex-ai-end -->
