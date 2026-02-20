# Pepper ↔ Jeeves Coordination Channel

This folder is the bot-to-bot communication layer when Jeeves is external.

## Files

- `pepper_to_jeeves.md` → Pepper writes instructions here.
- `jeeves_to_pepper.md` → Jeeves writes updates/replies here.

## Protocol

1. Pepper appends a new message block with timestamp + message id.
2. Jeeves pulls latest `main`, reads `pepper_to_jeeves.md`, executes, and appends response in `jeeves_to_pepper.md`.
3. Jeeves commits/pushes to `data-collection`.
4. Pepper reviews and replies in `pepper_to_jeeves.md`.

## Required headers per message

Use this exact format:

```
## MSG <id>
Time: <ISO>
From: Pepper|Jeeves
Queue: <queue-id or n/a>
Type: instruction|status|blocker|done
Body:
- ...
```

Keep messages short and operational.
