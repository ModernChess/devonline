<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Modern Chess Online - Match Arena</title>
    <style>
        :root {
            --bg-color: #121212;
            --surface-color: #1e1e1e;
            --surface-alt: #161616;
            --border-color: #333;
            --primary: #4CAF50;
            --secondary: #2196F3;
            --danger: #ff5252;
            --text-color: #ffffff;
            --text-muted: #888;
        }

        body {
            margin: 0;
            padding: 15px;
            background: var(--bg-color);
            color: var(--text-color);
            font-family: sans-serif;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: flex-start;
            min-height: 100vh;
            box-sizing: border-box;
        }

        .version-badge {
            position: fixed;
            top: 15px;
            right: 15px;
            background: #ff9800;
            color: #121212;
            font-size: 0.75rem;
            font-weight: bold;
            padding: 5px 10px;
            border-radius: 20px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.4);
            z-index: 1000;
        }

        .screen {
            display: flex;
            width: 100%;
            max-width: 400px;
            flex-direction: column;
            align-items: center;
        }

        .top-bar {
            display: flex;
            justify-content: space-between;
            align-items: center;
            width: 100%;
            margin-bottom: 10px;
        }

        .btn {
            padding: 6px 12px;
            background: var(--primary);
            color: white;
            border: none;
            border-radius: 6px;
            font-size: 0.8rem;
            font-weight: bold;
            cursor: pointer;
        }
        .btn-danger { background: var(--danger); }
        .btn-secondary { background: var(--secondary); }

        #canvas-container {
            position: relative;
            width: 320px;
            height: 320px;
            background: #222;
            border: 2px solid var(--border-color);
            border-radius: 8px;
            overflow: hidden;
            margin-bottom: 15px;
        }

        canvas {
            display: block;
            background: #181818;
        }

        .status-banner {
            background: var(--surface-color);
            padding: 8px 12px;
            border-radius: 6px;
            font-size: 0.85rem;
            margin-bottom: 15px;
            width: 100%;
            box-sizing: border-box;
            text-align: center;
            font-weight: bold;
            color: #ffeb3b;
        }

        .chat-widget {
            width: 100%;
            background: var(--surface-color);
            border-radius: 10px;
            overflow: hidden;
            margin-bottom: 15px;
            box-sizing: border-box;
        }

        .chat-header {
            background: #252525;
            padding: 8px 12px;
            font-size: 0.85rem;
            font-weight: bold;
            color: var(--secondary);
            cursor: pointer;
            display: flex;
            justify-content: space-between;
        }

        .chat-body {
            height: 120px;
            overflow-y: auto;
            padding: 8px;
            display: flex;
            flex-direction: column;
            gap: 4px;
            background: var(--surface-alt);
        }

        .chat-msg {
            font-size: 0.8rem;
            background: #222;
            padding: 4px 8px;
            border-radius: 4px;
            word-break: break-word;
            text-align: left;
        }

        .chat-input-area {
            display: flex;
            border-top: 1px solid var(--border-color);
            padding: 6px;
            background: var(--surface-color);
            gap: 6px;
        }

        .chat-input-area input {
            flex: 1;
            background: #2a2a2a;
            border: 1px solid var(--border-color);
            border-radius: 4px;
            padding: 4px 8px;
            color: #fff;
            font-size: 0.8rem;
            outline: none;
        }

        #console-container {
            width: 100%;
            max-width: 400px;
            background: #000;
            border: 1px solid #333;
            border-radius: 8px;
            margin-top: 10px;
            overflow: hidden;
            font-family: monospace;
            box-sizing: border-box;
        }
        .console-header {
            background: #1a1a1a;
            padding: 6px 10px;
            font-size: 0.75rem;
            color: #00ff66;
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 1px solid #333;
        }
        #console-logs {
            height: 90px;
            overflow-y: auto;
            padding: 6px;
            font-size: 0.7rem;
            color: #00ff66;
            text-align: left;
            line-height: 1.25;
            background: #080808;
        }
    </style>
</head>
<body>

    <div class="version-badge">devonline v1.8-split-game</div>

    <!-- 4. GAME SCREEN -->
    <div id="game-screen" class="screen">
        <div class="top-bar">
            <span id="playerTeamBadge" style="font-weight:bold; font-size:0.85rem;">Team: LOADING</span>
            <button class="btn btn-danger" id="surrenderBtn">Surrender / Leave</button>
        </div>
        
        <div class="status-banner" id="statusBanner">Connecting to match arena...</div>

        <div id="canvas-container">
            <canvas id="gameCanvas" width="320" height="320"></canvas>
        </div>

        <div class="chat-widget">
            <div class="chat-header" id="chatToggle">
                <span>Match Chat</span>
                <span>▲</span>
            </div>
            <div class="chat-body" id="chatMessages">
                <div style="color:var(--text-muted); font-size:0.75rem; text-align:center;">Match chat initialized.</div>
            </div>
            <div class="chat-input-area">
                <input type="text" id="chatInput" placeholder="Say something...">
                <button class="btn btn-secondary" id="chatSend">Send</button>
            </div>
        </div>
    </div>

    <!-- In-Page Console Tracker Drawer -->
    <div id="console-container">
        <div class="console-header">
            <span>LIVE SYSTEM CONSOLE</span>
            <button id="clearConsole" style="background:none; border:none; color:#ff5252; cursor:pointer; font-size:0.7rem; font-weight:bold;">CLEAR</button>
        </div>
        <div id="console-logs"></div>
    </div>

    <script type="module">
        import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
        import { getDatabase, ref, onValue, remove } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

        const consoleLogsEl = document.getElementById('console-logs');
        function logToScreen(type, args) {
            const line = document.createElement('div');
            line.textContent = `[${new Date().toLocaleTimeString()}] [${type.toUpperCase()}] ` + Array.from(args).map(arg => 
                typeof arg === 'object' ? JSON.stringify(arg) : arg
            ).join(' ');
            if(type === 'error') line.style.color = '#ff5252';
            if(type === 'warn') line.style.color = '#ffeb3b';
            consoleLogsEl.appendChild(line);
            consoleLogsEl.scrollTop = consoleLogsEl.scrollHeight;
        }

        console.log = function(...args) { logToScreen('log', args); };
        console.error = function(...args) { logToScreen('error', args); };
        console.warn = function(...args) { logToScreen('warn', args); };
        document.getElementById('clearConsole').onclick = () => { consoleLogsEl.innerHTML = ''; };

        console.log("Initializing Game Canvas Firebase App...");
        const firebaseConfig = { databaseURL: "https://mchess12333-default-rtdb.asia-southeast1.firebasedatabase.app/" };
        const app = initializeApp(firebaseConfig);
        const db = getDatabase(app);

        // Basic canvas render test loop
        const canvas = document.getElementById('gameCanvas');
        const ctx = canvas.getContext('2d');
        function drawGrid() {
            ctx.fillStyle = '#181818';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            const size = canvas.width / 8;
            for(let r=0; r<8; r++) {
                for(let c=0; c<8; c++) {
                    ctx.fillStyle = (r+c)%2 === 0 ? '#262626' : '#1a1a1a';
                    ctx.fillRect(c*size, r*size, size, size);
                }
            }
        }
        drawGrid();
        console.log("Game canvas render loop ready.");

        document.getElementById('surrenderBtn').onclick = () => {
            window.location.href = 'index.html';
        };
    </script>
</body>
</html>
