# Telegram alerts

When an alert really changes (door open too long, too warm, door opened while locked up, sensor fault, back to normal) the board publishes one message on `smarthome/event/alert`:

```
{"alert":"door_open","text":"🚪 Cold storage: door open too long / Kho lạnh: cửa mở quá lâu (29.5 °C)"}
```

EMQX Cloud forwards that text to a Telegram group with its built-in HTTP Server connector (free Serverless quota: 1 million rule actions a month). The bot token lives only in EMQX: never put it in this repository or in `secrets.h`.

## 1. Create the bot (in Telegram)

1. Open **@BotFather**, send `/newbot`, choose a name and a username ending in `bot`.
2. BotFather replies with a **token** like `123456789:AA...`. Keep it private.
3. Create a **group** (for example "Cold storage alerts"), add both people and your bot, and send any message in the group.

## 2. Find the group's chat id

Open this address in a browser (put your token in place of `<TOKEN>`):

```
https://api.telegram.org/bot<TOKEN>/getUpdates
```

Look for `"chat":{"id":-100...` . A group id is a **negative number**. If the list is empty, send another message in the group and reload.

## 3. EMQX console

**Data Integration → Connectors → New → HTTP Server**

- URL: `https://api.telegram.org` (if the form has a single URL field, use `https://api.telegram.org/bot<TOKEN>/sendMessage`)
- Name it `telegram` and create it.

**Data Integration → Rules → New**

- SQL:

```sql
SELECT payload.text AS text FROM "smarthome/event/alert"
```

- Action: **HTTP Server**, connector `telegram`
  - Method: `POST`
  - Path: `/bot<TOKEN>/sendMessage` (skip if the URL above already has it)
  - Headers: `Content-Type: application/json`
  - Body:

```
{"chat_id":"<CHAT_ID>","text":"${text}"}
```

Optional second rule, so you also hear when the board drops off the cloud (its last will):

```sql
SELECT '🔌 Cold storage monitor went offline / Thiết bị giám sát kho lạnh mất kết nối' AS text FROM "smarthome/status" WHERE payload = 'offline'
```

with the same action.

## 4. Test

```
python tools/watch.py 3 'smarthome/event/alert={"alert":"test","text":"Test message / Tin nhắn thử"}'
```

The group should receive the message within a few seconds. A real test without touching anything: turn Lock-up mode on and off on the page; the open door raises a lock-up alert and then returns to the door alert.

## Notes

- Messages are sent only on a real change, not on every reconnect, so a Wi-Fi drop does not repeat an old alert.
- If EMQX shows the rule fired but nothing arrives, check the chat id (negative for a group), that the bot is in the group, and the rule's action log in the console.
