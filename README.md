# Blink Bash

A fast, phone-first, 2–8 player party game. Players join a room from their own device and race through eight short rounds.

## Start a game

1. On the computer hosting the game, double-click `start-game.bat`.
2. Open `http://localhost:4317` in a browser on the host. The server window also lists the Wi-Fi address phones can use.
3. Create a room, then share the **GAME ADDRESS** and four-letter **ROOM CODE** shown in the room with your friends.
4. Friends open that address on their phones, enter a display name and the code, and join. Phones need to be on the same Wi-Fi network (or the host's hotspot).
5. The host starts once at least two people have joined. Keep the server window open for the whole match.

If the host computer asks whether Node.js may accept local network connections, allow it on the private network so other phones can reach the game.

## How to play

- Eight shuffled rounds: three reflex rounds, three quick-pick questions, and two memory sequences.
- Reflex: wait for the green signal, then tap. Early taps score zero.
- Quick pick: answer a four-choice question before the 10.5-second timer ends.
- Memory dash: memorize the sequence shown for 2.6 seconds, then choose its match before time runs out.
- Correct answers earn 3 points for first, 2 for second, and 1 for each later correct answer. Wrong answers and timeouts earn zero. Equal server-recorded answer times share the same rank and points.
- The top total after round eight wins; a tied top score shares the win.

## Notes

The host runs the live game server, so everyone must be able to reach the host computer over the local network. Room and match data live in server memory and are cleared when the server stops. No accounts, installs, or third-party services are needed beyond a recent Node.js runtime on the host.
