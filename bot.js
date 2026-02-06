const { Client, GatewayIntentBits, EmbedBuilder, PermissionsBitField } = require('discord.js');
const express = require('express');
const fs = require('fs');
const path = require('path');

// ============================================
// CONFIGURATION
// ============================================
const CONFIG = {
    DISCORD_TOKEN: 'MTQ2NTA3NDQxMDc4MzI0ODU3MA.GF0L7C.uhVM0sZObYCw4mpsX-YPRVcPrciLcNeSxKAcZQ', // ← Replace this!
    API_PORT: 3000,

    CHANNELS: {
        CODES: '1465062694620237854',
        REPORTS: '1404477029402808525',
        REPORT_NOTIFICATIONS: '1465060409102041118',
        MMR_TRACKING: '1465062863650557984'
    },

    ROLES: {
        BRONZE: '1468435586116489388',
        SILVER: '1468435649756659712',
        GOLD: '1468435997837754419',
        DIAMOND: '1468436117404651552',
        SAPPHIRE: '1468436338725490881',
        RUBY: '1468436386032914534',
        COMP_BANNED: '1468452209950724116'
    },

    RANK_CONFIG: {
        BRONZE:   { name: 'Bronze',   mmrRange: [0, 499],     tier: 'low',  emoji: '🥉', roleId: '1468435586116489388' },
        SILVER:   { name: 'Silver',   mmrRange: [500, 999],   tier: 'low',  emoji: '🥈', roleId: '1468435649756659712' },
        GOLD:     { name: 'Gold',     mmrRange: [1000, 1999], tier: 'mid',  emoji: '🥇', roleId: '1468435997837754419' },
        DIAMOND:  { name: 'Diamond',  mmrRange: [2000, 2999], tier: 'mid',  emoji: '💎', roleId: '1468436117404651552' },
        SAPPHIRE: { name: 'Sapphire', mmrRange: [3000, 4999], tier: 'high', emoji: '💠', roleId: '1468436338725490881' },
        RUBY:     { name: 'Ruby',     mmrRange: [5000, 99999],tier: 'high', emoji: '🔴', roleId: '1468436386032914534' }
    },

    MMR_SETTINGS: {
        STARTING_MMR: 200
    }
};

// ============================================
// DATA MANAGER
// ============================================
class DataManager {
    constructor() {
        this.dataDir      = path.join(__dirname, 'data');
        this.accountsFile = path.join(this.dataDir, 'accounts.json');
        this.codesFile    = path.join(this.dataDir, 'codes.json');
        this.linkingFile  = path.join(this.dataDir, 'linking.json');
        this.matchesFile  = path.join(this.dataDir, 'matches.json');

        this.ensureDataDir();

        this.accounts     = this.loadData(this.accountsFile, {});
        this.activeCodes  = this.loadData(this.codesFile, []);
        this.linkingCodes = this.loadData(this.linkingFile, {});
        this.matches      = this.loadData(this.matchesFile, []);
    }

    ensureDataDir() {
        if (!fs.existsSync(this.dataDir)) {
            fs.mkdirSync(this.dataDir, { recursive: true });
        }
    }

    loadData(filepath, defaultValue) {
        try {
            if (fs.existsSync(filepath)) {
                const content = fs.readFileSync(filepath, 'utf8');
                if (!content.trim()) return defaultValue;
                return JSON.parse(content);
            }
        } catch (err) {
            console.error(`Failed to load ${filepath}:`, err.message);
        }
        return defaultValue;
    }

    saveData(filepath, data) {
        try {
            fs.writeFileSync(filepath, JSON.stringify(data, null, 2), 'utf8');
        } catch (err) {
            console.error(`Failed to save ${filepath}:`, err.message);
        }
    }

    // ─── Account Helpers ─────────────────────────────────────
    getAccount(discordId) {
        return this.accounts[discordId] ?? null;
    }

    getAccountByPlayFabId(playFabId) {
        if (!playFabId || typeof playFabId !== 'string') return null;
        const cleanId = playFabId.trim();
        if (!cleanId || cleanId === 'Unknown') return null;

        for (const [discordId, acc] of Object.entries(this.accounts)) {
            if (acc.playFabId === cleanId) {
                return { discordId, ...acc };
            }
        }
        return null;
    }

    createAccount(discordId, playFabId, temporaryPhotonName) {
        if (this.accounts[discordId]) return false;

        this.accounts[discordId] = {
            playFabId: playFabId.trim(),
            photonName: temporaryPhotonName,
            mmr: CONFIG.MMR_SETTINGS.STARTING_MMR,
            wins: 0,
            losses: 0,
            tags: 0,
            timesSurvived: 0,
            linkedAt: Date.now()
        };

        this.saveData(this.accountsFile, this.accounts);
        console.log(`[ACCOUNT] Created for Discord ${discordId} | PlayFab: ${playFabId}`);
        return true;
    }

    updateMMR(discordId, mmrChange, stats = {}) {
        const acc = this.accounts[discordId];
        if (!acc) return null;

        acc.mmr = Math.max(0, acc.mmr + mmrChange);

        if (stats.isWin === true)      acc.wins++;
        if (stats.isWin === false)     acc.losses++;
        if (typeof stats.tags === 'number')     acc.tags += stats.tags;
        if (typeof stats.survived === 'number') acc.timesSurvived += stats.survived;

        this.saveData(this.accountsFile, this.accounts);
        return acc;
    }

    // ─── Linking ─────────────────────────────────────────────
    createLinkingSession(discordId) {
        let photonName;
        do {
            photonName = Math.floor(10000 + Math.random() * 90000).toString();
        } while (this.linkingCodes[photonName]);

        this.linkingCodes[photonName] = {
            discordId,
            photonName,
            createdAt: Date.now(),
            expiresAt: Date.now() + 10 * 60 * 1000, // 10 min
            linked: false
        };

        this.saveData(this.linkingFile, this.linkingCodes);
        return photonName;
    }

    getLinkingSession(photonName) {
        const session = this.linkingCodes[photonName];
        if (!session) return null;

        if (Date.now() > session.expiresAt) {
            delete this.linkingCodes[photonName];
            this.saveData(this.linkingFile, this.linkingCodes);
            return null;
        }

        return session;
    }

    markSessionLinked(photonName) {
        if (this.linkingCodes[photonName]) {
            this.linkingCodes[photonName].linked = true;
            this.saveData(this.linkingFile, this.linkingCodes);
        }
    }

    getAllPendingLinks() {
        const now = Date.now();
        const pending = {};

        for (const [key, val] of Object.entries(this.linkingCodes)) {
            if (!val.linked && val.expiresAt > now) {
                pending[key] = val;
            }
        }
        return pending;
    }

    // ─── Room Codes ──────────────────────────────────────────
    addRoomCode(code, tier, createdBy = 'ADMIN') {
        this.activeCodes.push({
            code: code.trim().toUpperCase(),
            tier: tier.toLowerCase(),
            createdBy,
            createdAt: Date.now()
        });

        const oneHourAgo = Date.now() - 3600000;
        this.activeCodes = this.activeCodes.filter(c => c.createdAt > oneHourAgo);

        this.saveData(this.codesFile, this.activeCodes);
    }

    getRoomCodesByTier(tier) {
        const fiveMinAgo = Date.now() - 300000;
        return this.activeCodes.filter(c =>
            c.tier === tier.toLowerCase() && c.createdAt > fiveMinAgo
        );
    }

    getAllActiveCodes() {
        const fiveMinAgo = Date.now() - 300000;
        return this.activeCodes.filter(c => c.createdAt > fiveMinAgo);
    }

    // ─── Matches ─────────────────────────────────────────────
    addMatchRecord(record) {
        this.matches.push({
            id: record.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            playFabId: record.playFabId,
            discordId: record.discordId,
            mmrChange: record.mmrChange,
            tags: record.tags,
            survived: record.survived,
            matchId: record.matchId || null,
            roomCode: record.roomCode || null,
            timestamp: record.timestamp || Date.now(),
            flags: record.flags || []
        });

        if (this.matches.length > 10000) {
            this.matches = this.matches.slice(-10000);
        }

        this.saveData(this.matchesFile, this.matches);
    }
}

const dataManager = new DataManager();

// ============================================
// HELPERS
// ============================================
function getRankFromMMR(mmr) {
    for (const rank of Object.values(CONFIG.RANK_CONFIG)) {
        if (mmr >= rank.mmrRange[0] && mmr <= rank.mmrRange[1]) {
            return rank;
        }
    }
    return CONFIG.RANK_CONFIG.BRONZE;
}

async function isUserBanned(guild, userId) {
    try {
        const member = await guild.members.fetch(userId).catch(() => null);
        return member?.roles.cache.has(CONFIG.ROLES.COMP_BANNED) ?? false;
    } catch {
        return false;
    }
}

async function updateUserRoles(guild, userId, mmr) {
    try {
        const member = await guild.members.fetch(userId).catch(() => null);
        if (!member) return;

        const newRank = getRankFromMMR(mmr);
        const rankRoleIds = Object.values(CONFIG.ROLES).filter(id => id !== CONFIG.ROLES.COMP_BANNED);

        await Promise.all(
            rankRoleIds.map(id => member.roles.cache.has(id) ? member.roles.remove(id) : null)
        );

        await member.roles.add(newRank.roleId);
        console.log(`[ROLES] Updated ${userId} → ${newRank.name}`);
    } catch (err) {
        console.error(`[ROLES] Failed to update ${userId}:`, err.message);
    }
}

// ============================================
// DISCORD CLIENT
// ============================================
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

// ============================================
// COMMANDS
// ============================================
client.on('messageCreate', async message => {
    if (message.author.bot) return;
    if (!message.content.startsWith('!')) return;

    const args = message.content.slice(1).trim().split(/\s+/);
    const command = args.shift()?.toLowerCase();

    // !linkaccount
    if (command === 'linkaccount') {
        const isBanned = await Promise.all(
            client.guilds.cache.map(g => isUserBanned(g, message.author.id))
        ).then(results => results.some(Boolean));

        if (isBanned) {
            return message.reply('You are banned from competitive play.');
        }

        if (dataManager.getAccount(message.author.id)) {
            return message.reply('Your account is already linked. Use `!unlink` to change it.');
        }

        const photonName = dataManager.createLinkingSession(message.author.id);

        const embed = new EmbedBuilder()
            .setTitle('🔗 Link Your Account')
            .setDescription('Follow these steps:')
            .addFields(
                { name: '1. Join Linking Room', value: 'Room code: **LINK**' },
                { name: '2. Set Photon Name',    value: `**${photonName}**` },
                { name: '3. Wait',               value: 'Linking completes automatically' },
                { name: 'Note',                  value: 'Code expires in 10 minutes\nYou can change name after linking' }
            )
            .setColor(0x00AAFF)
            .setTimestamp();

        try {
            await message.author.send({ embeds: [embed] });
            await message.reply('Check your DMs!');
        } catch {
            await message.reply('I couldn\'t DM you. Please enable DMs from server members.');
        }
    }

    // !rankedcode
    if (command === 'rankedcode') {
        const isBanned = await Promise.all(
            client.guilds.cache.map(g => isUserBanned(g, message.author.id))
        ).then(r => r.some(Boolean));

        if (isBanned) return message.reply('You are banned from competitive play.');

        let member = null;
        for (const guild of client.guilds.cache.values()) {
            member = await guild.members.fetch(message.author.id).catch(() => null);
            if (member) break;
        }

        if (!member) return message.reply('Could not find you in any server.');

        const tier = (() => {
            if (member.roles.cache.has(CONFIG.ROLES.RUBY) || member.roles.cache.has(CONFIG.ROLES.SAPPHIRE)) return 'high';
            if (member.roles.cache.has(CONFIG.ROLES.DIAMOND) || member.roles.cache.has(CONFIG.ROLES.GOLD)) return 'mid';
            if (member.roles.cache.has(CONFIG.ROLES.SILVER) || member.roles.cache.has(CONFIG.ROLES.BRONZE)) return 'low';
            return null;
        })();

        if (!tier) return message.reply('You don\'t have a rank role yet. Link your account first!');

        const codes = dataManager.getRoomCodesByTier(tier);
        if (codes.length === 0) {
            return message.reply(`No active **${tier.toUpperCase()}** rooms right now.`);
        }

        const latest = codes[codes.length - 1];

        const embed = new EmbedBuilder()
            .setTitle(`${tier.toUpperCase()} Tier Room Code`)
            .addFields(
                { name: 'Code', value: `\`${latest.code}\``, inline: true },
                { name: 'Tier', value: tier.toUpperCase(), inline: true },
                { name: 'Created', value: `<t:${Math.floor(latest.createdAt / 1000)}:R>`, inline: true }
            )
            .setColor(tier === 'high' ? 0xFF0000 : tier === 'mid' ? 0xFFAA00 : 0x00AAFF);

        try {
            await message.author.send({ embeds: [embed] });
            await message.reply('Check your DMs!');
        } catch {
            await message.reply('Couldn\'t send DM. Enable DMs from server members.');
        }
    }

    // !stats [user]
    if (command === 'stats') {
        let target = message.mentions.users.first() || message.author;
        const acc = dataManager.getAccount(target.id);

        if (!acc) {
            return message.reply(target.id === message.author.id
                ? 'You haven\'t linked your account yet! Use `!linkaccount`'
                : 'That user hasn\'t linked their account.');
        }

        const rank = getRankFromMMR(acc.mmr);
        const winRate = (acc.wins + acc.losses > 0)
            ? ((acc.wins / (acc.wins + acc.losses)) * 100).toFixed(1)
            : '0.0';

        const embed = new EmbedBuilder()
            .setTitle(`${rank.emoji} ${target.username}'s Stats`)
            .addFields(
                { name: 'Rank',     value: rank.name,          inline: true },
                { name: 'MMR',      value: acc.mmr.toString(), inline: true },
                { name: 'Wins',     value: acc.wins.toString(), inline: true },
                { name: 'Losses',   value: acc.losses.toString(), inline: true },
                { name: 'Win Rate', value: `${winRate}%`,       inline: true },
                { name: 'Tags',     value: acc.tags.toString(), inline: true },
                { name: 'Survived', value: acc.timesSurvived.toString(), inline: true }
            )
            .setColor(0x00FF88)
            .setTimestamp();

        message.reply({ embeds: [embed] });
    }

    // !unlink
    if (command === 'unlink') {
        if (!dataManager.getAccount(message.author.id)) {
            return message.reply('No account linked.');
        }
        delete dataManager.accounts[message.author.id];
        dataManager.saveData(dataManager.accountsFile, dataManager.accounts);
        message.reply('Account unlinked.');
    }

    // !leaderboard / !lb
    if (command === 'leaderboard' || command === 'lb') {
        const top = Object.entries(dataManager.accounts)
            .map(([id, data]) => ({ id, ...data }))
            .sort((a, b) => b.mmr - a.mmr)
            .slice(0, 10);

        if (top.length === 0) return message.reply('No linked players yet.');

        const lines = await Promise.all(top.map(async (acc, i) => {
            try {
                const user = await client.users.fetch(acc.id);
                const rank = getRankFromMMR(acc.mmr);
                return `${i+1}. ${rank.emoji} **${user.username}** — ${acc.mmr} MMR`;
            } catch {
                return `${i+1}. Unknown — ${acc.mmr} MMR`;
            }
        }));

        const embed = new EmbedBuilder()
            .setTitle('🏆 Top 10 Leaderboard')
            .setDescription(lines.join('\n') || 'No players')
            .setColor(0xFFD700);

        message.reply({ embeds: [embed] });
    }

    // !mmr @user amount (admin only)
    if (command === 'mmr') {
        if (!message.member?.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return message.reply('Admin only.');
        }

        const target = message.mentions.users.first();
        if (!target) return message.reply('Mention a user: `!mmr @user 50`');

        const amount = parseInt(args[0]);
        if (isNaN(amount)) return message.reply('Invalid number.');

        const acc = dataManager.getAccount(target.id);
        if (!acc) return message.reply('User not linked.');

        const updated = dataManager.updateMMR(target.id, amount);

        for (const guild of client.guilds.cache.values()) {
            await updateUserRoles(guild, target.id, updated.mmr);
        }

        const rank = getRankFromMMR(updated.mmr);
        message.reply(`MMR updated: **${target.username}** → ${updated.mmr} (${rank.emoji} ${rank.name})`);
    }
});

// ============================================
// EXPRESS API
// ============================================
const app = express();
app.use(express.json());

// Health check
app.get('/api/health', (_, res) => res.json({ status: 'ok', time: Date.now() }));

// Ban status
app.get('/api/account/ban-status', async (req, res) => {
    const { discordId } = req.query;
    if (!discordId) return res.status(400).json({ error: 'Missing discordId' });

    let banned = false;
    for (const guild of client.guilds.cache.values()) {
        if (await isUserBanned(guild, discordId)) {
            banned = true;
            break;
        }
    }
    res.json({ banned });
});

// Create linking session (called from mod)
app.get('/api/linking/create', (req, res) => {
    const { discordId } = req.query;
    if (!discordId) return res.status(400).json({ error: 'Missing discordId' });

    const photonName = dataManager.createLinkingSession(discordId);
    return res.json({ photonName });
});

// Confirm link (called from game/mod)
app.post('/api/account/confirm-link', async (req, res) => {
    const { temporaryPhotonName, playFabId } = req.body;

    if (!temporaryPhotonName || !playFabId || playFabId === 'Unknown') {
        return res.status(400).json({ error: 'Invalid or missing fields' });
    }

    const session = dataManager.getLinkingSession(temporaryPhotonName);
    if (!session) {
        return res.status(404).json({ error: 'Linking session not found or expired' });
    }

    if (dataManager.getAccountByPlayFabId(playFabId)) {
        return res.status(409).json({ error: 'PlayFab ID already linked' });
    }

    const success = dataManager.createAccount(session.discordId, playFabId, temporaryPhotonName);
    if (!success) {
        return res.status(409).json({ error: 'Discord account already has a linked PlayFab ID' });
    }

    dataManager.markSessionLinked(temporaryPhotonName);

    for (const guild of client.guilds.cache.values()) {
        await updateUserRoles(guild, session.discordId, CONFIG.MMR_SETTINGS.STARTING_MMR);
    }

    try {
        const user = await client.users.fetch(session.discordId);
        const rank = getRankFromMMR(CONFIG.MMR_SETTINGS.STARTING_MMR);

        await user.send({
            embeds: [new EmbedBuilder()
                .setTitle('✅ Account Linked!')
                .setDescription(`PlayFab: **${playFabId}**\nStarting Rank: ${rank.emoji} ${rank.name}\nMMR: ${CONFIG.MMR_SETTINGS.STARTING_MMR}`)
                .setColor(0x00FF00)
                .setTimestamp()]
        });
    } catch {}

    res.json({ success: true, discordId: session.discordId, playFabId });
});

// MMR update from game/mod
app.post('/api/mmr/update', async (req, res) => {
    const { playFabId, mmrChange, tags, survived, matchId, roomCode, timestamp } = req.body || {};

    if (!playFabId || typeof mmrChange !== 'number') {
        return res.status(400).json({ error: 'Missing playFabId or mmrChange' });
    }

    const flags = [];
    if (mmrChange > 200 || mmrChange < -200) {
        flags.push('mmrChange_out_of_bounds');
    }
    if (typeof tags === 'number' && tags > 100) {
        flags.push('tags_suspicious');
    }
    if (typeof survived === 'number' && survived > 10) {
        flags.push('survived_suspicious');
    }

    const acc = dataManager.getAccountByPlayFabId(playFabId);
    if (!acc) {
        return res.status(404).json({ error: 'Account not linked for this PlayFab ID' });
    }

    const safeChange = Math.max(-200, Math.min(200, mmrChange));
    const updated = dataManager.updateMMR(acc.discordId, safeChange, {
        tags: typeof tags === 'number' ? tags : 0,
        survived: typeof survived === 'number' ? survived : 0
    });

    dataManager.addMatchRecord({
        playFabId,
        discordId: acc.discordId,
        mmrChange: safeChange,
        tags: typeof tags === 'number' ? tags : 0,
        survived: typeof survived === 'number' ? survived : 0,
        matchId: matchId || null,
        roomCode: roomCode || null,
        timestamp: timestamp ? timestamp * 1000 : Date.now(),
        flags
    });

    for (const guild of client.guilds.cache.values()) {
        await updateUserRoles(guild, acc.discordId, updated.mmr);
    }

    const mmrChannel = client.channels.cache.get(CONFIG.CHANNELS.MMR_TRACKING);
    if (mmrChannel) {
        const rank = getRankFromMMR(updated.mmr);
        const embed = new EmbedBuilder()
            .setTitle('MMR Update')
            .setDescription(`PlayFab: \`${playFabId}\`\nDiscord: <@${acc.discordId}>`)
            .addFields(
                { name: 'Change', value: safeChange.toString(), inline: true },
                { name: 'New MMR', value: updated.mmr.toString(), inline: true },
                { name: 'Rank', value: `${rank.emoji} ${rank.name}`, inline: true },
                { name: 'Tags', value: String(tags ?? 0), inline: true },
                { name: 'Survived', value: String(survived ?? 0), inline: true },
                { name: 'Flags', value: flags.length ? flags.join(', ') : 'None', inline: false }
            )
            .setColor(flags.length ? 0xFF0000 : 0x00FF00)
            .setTimestamp();

        mmrChannel.send({ embeds: [embed] }).catch(() => {});
    }

    res.json({ success: true, mmr: updated.mmr, flags });
});

// Create room (admin / external)
app.post('/api/room/create', async (req, res) => {
    const { code, tier, createdBy } = req.body;
    if (!code || !tier) return res.status(400).json({ error: 'Missing code or tier' });

    dataManager.addRoomCode(code, tier, createdBy || 'API');

    const channel = client.channels.cache.get(CONFIG.CHANNELS.CODES);
    if (channel) {
        await channel.send({
            embeds: [new EmbedBuilder()
                .setTitle(`New ${tier.toUpperCase()} Room`)
                .setDescription(`Code: \`${code}\``)
                .addFields({ name: 'Tier', value: tier.toUpperCase() })
                .setColor(0x5865F2)]
        }).catch(() => {});
    }

    res.json({ success: true, code });
});

// ============================================
// STARTUP
// ============================================
client.once('ready', () => {
    console.log(`Bot ready: ${client.user.tag}`);
    console.log(`Loaded ${Object.keys(dataManager.accounts).length} accounts`);

    app.listen(CONFIG.API_PORT, () => {
        console.log(`API listening on port ${CONFIG.API_PORT}`);
    });
});

client.login(CONFIG.DISCORD_TOKEN);
