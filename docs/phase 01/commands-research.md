# Commands Research
This document is a research into the commands that can be used to interact with the various CLI agents through the MCP.
The goal is to find ways to run the same "set" of commands regardless of the agent being used.

## Command Structure
- create new chat: needs to be able to return a chat\session id. if not provided, stateful mode will not be supported.
- send prompt to squad member: needs to be able to send a prompt to the squad member and return the response. this supports both stateless and stateful modes. if create new chat is defined (and stateful mode = true), a chatId is returned when the orchestrator starts a new squad member.

# OpenAI Codex
### Create New Chat (Stateful Mode)
```
codex exec --json "" \
  | jq -rc '
      if .type == "thread.started" then
        "\(.thread_id)"    
      else
        empty
      end
    '
```
> this will return the session id so we can resume the same session in prompt commands

### Send Prompt to Squad Member
```
codex exec --json<% if (chatId) { %> resume <%= chatId %><% } %> "<%= prompt %>" \
  | jq -rc '
      if .type == "item.completed" and .item.type == "agent_message" then 
        .item.text
      else
        empty
      end
    '
```

> If chatId is provided, it will resume the same session so the same spawned squad member will respond.

# Cursor Agent
## Statefull Mode
### Create New Chat
```
cursor agent create-chat
```
> this will return the chat id so we can resume the same session in prompt commands

### Send Prompt to Squad Member
```
cursor-agent --approve-mcps --model=composer-1 --print<% if (chatId) { %> --resume <%= chatId %><% } %> agent "<%= prompt %>"
```

## Claude Code CLI
### Create New Chat
```
echo "<%= generatedUuid %>"
```
> claude code decide if a chat should be persisted or not based of if a session id is provided.
> So creating a new chat is just a matter of generating a new uuid to be used when calling the prompt command.

### Send Prompt to Squad Member
```
claude -p --output-format=json<% if (chatId) { %> --session-id "<%= chatId %>"<% } %> "<%= prompt %>" | jq -rc '.result.content[] | select(.type == "text") | .text'
```
> If chatId is provided, it will resume the same session so the same spawned squad member will respond.
> if a session does not exist for that chatId, a new session will be created and the prompt will be sent to the squad member.

## Dry Run
Only shows what would have been sent to the squad member.
### Create New Chat
```
echo "<%= generatedUuid %>"
```
> since we want this command to return a chatId value, in dry run we just return the generatedUuid.

### Send Prompt to Squad Member
```
echo "[DRY MODE]\nrole=<%= roleId %>\nprovider=<%= provider %>\nmodel=<%= model %>\nchatId=<%= generatedUuid %>\n======\n<%= prompt %>"
```
> since this is not an actual agent, we print the debug information so the orchestrator can see what would have been sent to the squad member.
> even though we enhance to prompt with the specific role's instructions, in dry run we just print the raw prompt.