## Project Configuration

- **Language**: TypeScript
- **Package Manager**: npm
- **Add-ons**: prettier, eslint, tailwindcss, drizzle, mcp, experimental

## Tech Stack

This project uses:

- **Skeleton** (UI toolkit) — <https://www.skeleton.dev/llms.txt>
- **Paraglide JS** (i18n) — <https://paraglidejs.com/>
- **Zero** by Rocicorp (sync engine) — <https://zero.rocicorp.dev/llms.txt>
- **Supabase** — <https://supabase.com/docs>
- **Drizzle ORM** — <https://orm.drizzle.team/docs/overview>
- **SvelteKit** — use SvelteKit remote functions for mutations instead of Zero mutators

Always prefer clean, maintainable code following best practices.

## Code Conventions

- **Avoid barrel files** (`index.ts` that re-exports a folder's modules) to prevent importing unwanted modules.
- **Prefer `$lib` absolute imports** over relative paths when importing from the `lib` folder. Exception: use a relative import when the imported file is in the same folder.

---

You are able to use the Svelte MCP server, where you have access to comprehensive Svelte 5 and SvelteKit documentation. Here's how to use the available tools effectively:

## Available Svelte MCP Tools:

### 1. list-sections

Use this FIRST to discover all available documentation sections. Returns a structured list with titles, use_cases, and paths.
When asked about Svelte or SvelteKit topics, ALWAYS use this tool at the start of the chat to find relevant sections.

### 2. get-documentation

Retrieves full documentation content for specific sections. Accepts single or multiple sections.
After calling the list-sections tool, you MUST analyze the returned documentation sections (especially the use_cases field) and then use the get-documentation tool to fetch ALL documentation sections that are relevant for the user's task.

### 3. svelte-autofixer

Analyzes Svelte code and returns issues and suggestions.
You MUST use this tool whenever writing Svelte code before sending it to the user. Keep calling it until no issues or suggestions are returned.

### 4. playground-link

Generates a Svelte Playground link with the provided code.
After completing the code, ask the user if they want a playground link. Only call this tool after user confirmation and NEVER if code was written to files in their project.
