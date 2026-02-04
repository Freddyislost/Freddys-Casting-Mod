# Freddy's Ranked System - Complete Documentation

## 📋 Overview

This is a complete ranked matchmaking system for VR-based tag games. It includes:
- **Discord Bot** - Handles account linking, MMR tracking, rank roles, and ban management
- **Player Mod** - For regular players to link accounts and join ranked rooms
- **Admin Mod** - For admins to create rooms, track matches, and calculate MMR

---

## 🤖 Discord Bot Features

### Commands

#### **!linkaccount**
- Generates a 5-digit linking code sent via DM
- Code expires in 10 minutes
- Checks if user is banned before generating code
- Response: "Join This Code With The Mod To Link Your Account: [code]"

#### **!stats [@user]**
- Shows player statistics (rank, MMR, wins, losses, tags)
- Works for yourself or mentioned users

#### **!unlink**
- Removes account link (allows re-linking)

#### **!leaderboard** or **!lb**
- Shows top 10 players by MMR

#### **!mmr @user <amount>** (Admin Only)
- Manually adjust a player's MMR
- Updates roles automatically

### Rank System

| Rank | MMR Range | Tier | Emoji | Room Access |
|------|-----------|------|-------|-------------|
| Bronze | 0-499 | Low | 🥉 | Low Rooms |
| Silver | 500-999 | Low | 🥈 | Low Rooms |
| Gold | 1000-1999 | Mid | 🥇 | Mid Rooms |
| Diamond | 2000-2999 | Mid | 💎 | Mid Rooms |
| Sapphire | 3000-4999 | High | 💠 | High Rooms |
| Ruby | 5000+ | High | 🔴 | High Rooms |

### MMR Calculation

The bot automatically updates MMR based on:
- **Tag Given:** +15 MMR per tag
- **Getting Tagged:** -12 MMR
- **Survival Time:** +0.5 MMR per second
- **Starting Tagger Bonus:** +10 MMR if starting tagger gets a tag
- **Full Survival Bonus:** +20 MMR if never tagged during match

### Ban System

- Users with role ID `1468452209950724116` are marked as banned
- Banned users cannot:
  - Generate linking codes
  - Join ranked rooms
  - Earn MMR
- Player mod displays "YOU ARE COMP BANNED" for banned users

### API Endpoints

```
GET  /api/health                    - Health check
GET  /api/account/ban-status        - Check if user is banned
POST /api/room/create               - Create a room code (admin)
POST /api/account/confirm-link      - Confirm account linking
GET  /api/account/status            - Get account info by Photon ID
POST /api/room/validate             - Validate room code and rank access
GET  /api/room/codes                - Get all active room codes
POST /api/mmr/update                - Update player MMR (admin mod)
```

---

## 🎮 Player Mod Features

### Account Linking

1. **First Time Setup:**
   - User types `!linkaccount` in Discord
   - Bot sends 5-digit code via DM
   - Player opens mod (TAB key)
   - Enters code in linking screen
   - Clicks "LINK ACCOUNT"
   - Automatically joins linking room
   - Account is linked and saved to `DO NOT REMOVE.txt`

2. **Subsequent Launches:**
   - Mod checks for `DO NOT REMOVE.txt`
   - If found, automatically validates with server
   - Loads MMR, rank, and tier information
   - Ready to join ranked rooms

### Ranked Room Access

**Room Tiers:**
- **Low Rooms:** Bronze, Silver (LOW prefix)
- **Mid Rooms:** Gold, Diamond (MID prefix)
- **High Rooms:** Sapphire, Ruby (HIGH prefix)

**Joining Process:**
1. Open mod (TAB key)
2. Click appropriate tier button (locked if rank doesn't match)
3. Mod generates code (e.g., LOW429, MID837, HIGH156)
4. Validates with server
5. Joins room if rank qualifies

### Ban Detection

- Mod checks ban status on startup and refresh
- If banned, shows "YOU ARE COMP BANNED" screen
- No access to any competitive features

### File Persistence

**Location:** `BepInEx/plugins/FreddysRanked/DO NOT REMOVE.txt`

**Contents:**
```
[Photon ID]
[Discord ID]
[Link Date]
```

**Important:** Deleting this file will require re-linking

---

## 👨‍💼 Admin Mod Features

### Room Creation

**Create Rooms:**
- Click "CREATE LOW RANK ROOM" → Generates LOW### code
- Click "CREATE MID RANK ROOM" → Generates MID### code
- Click "CREATE HIGH RANK ROOM" → Generates HIGH### code

**Automatic Actions:**
- Sends code to Discord bot
- Bot posts code in codes channel
- Admin automatically joins room
- Players can join via player mod

### Match Tracking

**Starting a Match:**
1. Click "START MATCH TRACKING"
2. Identifies all players in room
3. Detects starting tagger
4. Begins tracking survival time and tags

**During Match:**
- Real-time tag detection
- Survival time tracking per player
- Tags given/received counting
- Player list shows all stats (press P)

**Ending a Match:**
1. Click "END MATCH & CALCULATE MMR"
2. Calculates MMR for each player:
   - Tags given × 15 MMR
   - Survival time × 0.5 MMR
   - Tagged: -12 MMR
   - Starting tagger bonus: +10 MMR (if they tag someone)
   - Never tagged bonus: +20 MMR
3. Sends MMR updates to Discord bot
4. Bot updates ranks and roles
5. Posts results in MMR tracking channel

### Player List

**Press P to toggle**

Shows for each player:
- Name
- Status (SURVIVOR/INFECTED)
- Tags given
- Survival time
- Real-time updates

### Tag Detection System

The mod uses infection status changes to detect tags:

```csharp
// Monitors each player's infection status (setMatIndex)
// 0 = Survivor, non-0 = Infected

// When player changes from 0 → non-0:
// - Player got tagged
// - Find nearest infected player who tagged them
// - Increment tagger's tag count
// - Mark player as tagged
```

---

## 🔧 Installation

### Discord Bot

1. **Install Dependencies:**
```bash
npm install discord.js express
```

2. **Configure:**
   - Update `DISCORD_TOKEN` in bot.js
   - Update channel IDs
   - Update role IDs

3. **Run:**
```bash
node enhanced-bot.js
```

4. **Deploy (Railway):**
   - Follow Railway_deployment.md guide
   - Update API endpoint in mods

### Player Mod

1. **Dependencies:**
   - BepInEx
   - Newtonsoft.Json
   - Gorilla Tag + Photon

2. **Installation:**
   - Compile `FreddysRankedPlayerMod.cs`
   - Place DLL in `BepInEx/plugins`

3. **Configuration:**
   - Update API endpoint if not using default

### Admin Mod

1. **Dependencies:**
   - Same as Player Mod

2. **Installation:**
   - Compile `FreddysRankedAdminMod.cs`
   - Place DLL in `BepInEx/plugins`

3. **Usage:**
   - TAB = Open/close main menu
   - P = Toggle player list

---

## 🎯 Usage Workflow

### For Players

1. **Link Account:**
   - Type `!linkaccount` in Discord
   - Copy 5-digit code from DM
   - Open mod (TAB)
   - Enter code and link

2. **Join Ranked Games:**
   - Open mod (TAB)
   - Click appropriate tier button
   - Join generated room
   - Play!

3. **Check Stats:**
   - Type `!stats` in Discord
   - Or `!leaderboard` for rankings

### For Admins

1. **Create Room:**
   - Open admin mod (TAB)
   - Click tier button (LOW/MID/HIGH)
   - Room created and posted to Discord

2. **Run Match:**
   - Wait for players to join
   - Click "START MATCH TRACKING"
   - Monitor with player list (P)
   - After match, click "END MATCH & CALCULATE MMR"

3. **Review Results:**
   - Check Discord MMR tracking channel
   - See updated ranks and MMR

---

## 🛡️ Security & Edge Cases

### File Tampering
- `DO NOT REMOVE.txt` validated with server on startup
- Invalid data = requires re-linking

### API Failures
- Mod handles network errors gracefully
- Shows error messages to user
- Doesn't crash on failed requests

### Invalid Codes
- Server validates all codes before joining
- Checks rank access before allowing join
- Expired codes (5min+ old) rejected

### Ban Circumvention
- Ban check on every linking attempt
- Checked on mod startup
- Checked before any competitive action

### MMR Manipulation
- Only admin mod can update MMR
- All changes logged to Discord
- Requires server API key (admin only)

---

## 📊 Discord Integration

### Channels Used

1. **Codes Channel** (`1465062694620237854`)
   - Posts all created room codes
   - Shows tier and creator

2. **MMR Tracking** (`1465062863650557984`)
   - Posts all MMR changes
   - Shows player, change, new rank

3. **Reports** (`1404477029402808525`)
   - Monitors for reports
   - Auto-applies penalties

4. **Report Notifications** (`1465060409102041118`)
   - Alerts on detected reports

### Role Management

Bot automatically assigns roles based on MMR:
- Removes old rank role
- Assigns new rank role
- Happens on:
  - Account linking
  - MMR updates
  - Manual adjustments

---

## 🎨 UI Features

### Player Mod
- Sleek dark theme with blue accents
- Pulsing header animation
- Color-coded status messages
- Locked/unlocked buttons based on rank
- Persistent status display

### Admin Mod
- Dual window system (main + player list)
- Real-time match tracking
- Scrollable player list
- Color-coded infection status
- Live stat updates

---

## 🔍 Troubleshooting

### "Account not linked"
- Check if `DO NOT REMOVE.txt` exists
- Try unlinking and re-linking
- Verify Discord bot is online

### "Cannot access this tier"
- Check your rank with `!stats`
- You need correct tier for room
- Bronze/Silver → Low only
- Gold/Diamond → Mid only
- Sapphire/Ruby → High only

### "YOU ARE COMP BANNED"
- Contact server administrators
- Role ID `1468452209950724116` is ban role
- Cannot be bypassed without role removal

### MMR not updating
- Ensure admin mod is used to end match
- Check Discord MMR tracking channel
- Verify bot has permissions

### Tags not detected
- Admin must start match tracking BEFORE match
- Players must be in room when tracking starts
- Tags detected via infection status changes

---

## 📝 Notes

- **Linking Code Expiry:** 10 minutes
- **Room Code Expiry:** 5 minutes (auto-cleanup)
- **Match Tracking:** Must be started manually by admin
- **Tag Detection:** Automatic once tracking is active
- **MMR Range:** 0 minimum, no maximum
- **Starting MMR:** 200 (Bronze rank)

---

## 🚀 Future Enhancements

Potential additions:
- Seasonal rank resets
- Placement matches for new players
- Skill-based matchmaking queues
- Detailed match history
- Player profiles with stats
- Achievement system
- Tournament mode

---

## 📄 License

MIT License - Feel free to modify and use!

---

## 🆘 Support

For issues or questions:
1. Check troubleshooting section
2. Review Discord bot logs
3. Check mod console logs (BepInEx)
4. Verify all API endpoints are correct
5. Test with health endpoint: `/api/health`

---

**Made for Freddy's Ranked Gorilla Tag System**
