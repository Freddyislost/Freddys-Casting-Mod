const { Client, GatewayIntentBits, EmbedBuilder, PermissionsBitField } = require('discord.js');
const express = require('express');
const fs = require('fs');
const path = require('path');

// ============================================
// CONFIGURATION
// ============================================
const CONFIG = {
    DISCORD_TOKEN: 'MTQ2NTA3NDQxMDc4MzI0ODU3MA.GF0L7C.uhVM0sZObYCw4mpsX-YPRVcPrciLcNeSxKAcZQ',
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
        RUBY: '1468436386032914534'
    },
    
    RANK_CONFIG: {
        BRONZE: { name: 'Bronze', mmrRange: [0, 399], tier: 'low', emoji: '🥉', roleId: '1468435586116489388' },
        SILVER: { name: 'Silver', mmrRange: [400, 799], tier: 'low', emoji: '🥈', roleId: '1468435649756659712' },
        GOLD: { name: 'Gold', mmrRange: [800, 1199], tier: 'mid', emoji: '🥇', roleId: '1468435997837754419' },
        DIAMOND: { name: 'Diamond', mmrRange: [1200, 1599], tier: 'mid', emoji: '💎', roleId: '1468436117404651552' },
        SAPPHIRE: { name: 'Sapphire', mmrRange: [1600, 1999], tier: 'high', emoji: '💠', roleId: '1468436338725490881' },
        RUBY: { name: 'Ruby', mmrRange: [2000, 9999], tier: 'high', emoji: '🔴', roleId: '1468436386032914534' }
    },
    
    MMR_SETTINGS: {
        WIN_MMR: 25,
        LOSS_MMR: -20,
        STARTING_MMR: 200,
        REPORT_MMR_PENALTY: -50
    },
    
    TARGET_PLAYFAB_ID: '8AF48285BEE7E5F5'
};

// ============================================
// DATA STORAGE
// ============================================
class DataManager {
    constructor() {
        this.dataDir = path.join(__dirname, 'data');
        this.accountsFile = path.join(this.dataDir, 'accounts.json');
        this.codesFile = path.join(this.dataDir, 'codes.json');
        this.linkingFile = path.join(this.dataDir, 'linking.json');
        
        this.ensureDataDir();
        this.accounts = this.loadData(this.accountsFile, {});
        this.activeCodes = this.loadData(this.codesFile, []);
        this.linkingCodes = this.loadData(this.linkingFile, {});
    }
    
    ensureDataDir() {
        if (!fs.existsSync(this.dataDir)) {
            fs.mkdirSync(this.dataDir, { recursive: true });
        }
    }
    
    loadData(filepath, defaultValue) {
        try {
            if (fs.existsSync(filepath)) {
                return JSON.parse(fs.readFileSync(filepath, 'utf8'));
            }
        } catch (error) {
            console.error(`Error loading ${filepath}:`, error);
        }
        return defaultValue;
    }
    
    saveData(filepath, data) {
        try {
            fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
        } catch (error) {
            console.error(`Error saving ${filepath}:`, error);
        }
    }
    
    getAccount(discordId) {
        return this.accounts[discordId] || null;
    }
    
    getAccountByPhotonId(photonId) {
        for (const [discordId, account] of Object.entries(this.accounts)) {
            if (account.photonId === photonId) {
                return { discordId, ...account };
            }
        }
        return null;
    }
    
    createAccount(discordId, photonId) {
        this.accounts[discordId] = {
            photonId: photonId,
            mmr: CONFIG.MMR_SETTINGS.STARTING_MMR,
            wins: 0,
            losses: 0,
            linkedAt: Date.now()
        };
        this.saveData(this.accountsFile, this.accounts);
    }
    
    updateMMR(discordId, mmrChange, isWin) {
        if (!this.accounts[discordId]) return;
        
        this.accounts[discordId].mmr += mmrChange;
        if (this.accounts[discordId].mmr < 0) {
            this.accounts[discordId].mmr = 0;
        }
        
        if (isWin !== undefined) {
            if (isWin) {
                this.accounts[discordId].wins++;
            } else {
                this.accounts[discordId].losses++;
            }
        }
        
        this.saveData(this.accountsFile, this.accounts);
    }
    
    createLinkingCode(discordId) {
        const code = this.generateLinkingCode();
        this.linkingCodes[code] = {
            discordId: discordId,
            createdAt: Date.now(),
            expiresAt: Date.now() + (10 * 60 * 1000)
        };
        this.saveData(this.linkingFile, this.linkingCodes);
        return code;
    }
    
    getLinkingCode(code) {
        const linkData = this.linkingCodes[code];
        if (!linkData) return null;
        
        if (Date.now() > linkData.expiresAt) {
            delete this.linkingCodes[code];
            this.saveData(this.linkingFile, this.linkingCodes);
            return null;
        }
        
        return linkData;
    }
    
    removeLinkingCode(code) {
        delete this.linkingCodes[code];
        this.saveData(this.linkingFile, this.linkingCodes);
    }
    
    generateLinkingCode() {
        return Math.floor(10000 + Math.random() * 90000).toString();
    }
    
    addRoomCode(code, tier, createdBy) {
        this.activeCodes.push({
            code: code,
            tier: tier,
            createdBy: createdBy,
            createdAt: Date.now()
        });
        
        const oneHourAgo = Date.now() - (60 * 60 * 1000);
        this.activeCodes = this.activeCodes.filter(c => c.createdAt > oneHourAgo);
        
        this.saveData(this.codesFile, this.activeCodes);
    }
    
    getRoomCodesByTier(tier) {
        const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
        return this.activeCodes.filter(c => 
            c.tier === tier && c.createdAt > fiveMinutesAgo
        );
    }
    
    getAllActiveCodes() {
        const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
        return this.activeCodes.filter(c => c.createdAt > fiveMinutesAgo);
    }
}

// ============================================
// UTILITY FUNCTIONS
// ============================================
function getRankFromMMR(mmr) {
    for (const [rankName, rankData] of Object.entries(CONFIG.RANK_CONFIG)) {
        if (mmr >= rankData.mmrRange[0] && mmr <= rankData.mmrRange[1]) {
            return { name: rankName, ...rankData };
        }
    }
    return CONFIG.RANK_CONFIG.BRONZE;
}

async function updateUserRoles(guild, userId, mmr) {
    try {
        const member = await guild.members.fetch(userId);
        const rank = getRankFromMMR(mmr);
        
        for (const rankData of Object.values(CONFIG.RANK_CONFIG)) {
            const role = guild.roles.cache.get(rankData.roleId);
            if (role && member.roles.cache.has(role.id)) {
                await member.roles.remove(role);
            }
        }
        
        const newRole = guild.roles.cache.get(rank.roleId);
        if (newRole) {
            await member.roles.add(newRole);
        }
        
        return rank;
    } catch (error) {
        console.error('Error updating user roles:', error);
        return null;
    }
}

function canAccessTier(mmr, tier) {
    const rank = getRankFromMMR(mmr);
    return rank.tier === tier;
}

function getTimeAgo(timestamp) {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ago`;
}

// ============================================
// INITIALIZE
// ============================================
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.DirectMessages
    ]
});

const dataManager = new DataManager();
const app = express();
app.use(express.json());

// ============================================
// DISCORD COMMANDS
// ============================================
client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    
    const args = message.content.trim().split(/\s+/);
    const command = args[0].toLowerCase();
    
    if (command === '!linkaccount') {
        const account = dataManager.getAccount(message.author.id);
        
        if (account) {
            return message.reply('Your account is already linked!');
        }
        
        const linkCode = dataManager.createLinkingCode(message.author.id);
        
        try {
            const dmEmbed = new EmbedBuilder()
                .setTitle('🔗 Link Your Account')
                .setDescription(`To link your Discord account with Gorilla Tag:
                
**1.** Contact the admin to help you link
**2.** Give them this code: **${linkCode}**
**3.** The admin will join room: **LINK${linkCode}**
**4.** Your account will be automatically linked!

Your linking code will expire in 10 minutes.

**ROOM CODE FOR ADMIN:** \`LINK${linkCode}\``)
                .setColor(0x00FF00)
                .setFooter({ text: 'Only the admin can complete linking by joining the room' })
                .setTimestamp();
            
            await message.author.send({ embeds: [dmEmbed] });
            message.reply('✅ Check your DMs for linking instructions!');
        } catch (error) {
            message.reply('❌ I couldn\'t send you a DM. Please enable DMs from server members.');
        }
    }
    
    if (command === '!codes') {
        const account = dataManager.getAccount(message.author.id);
        
        if (!account) {
            return message.reply('You need to link your account first! Use `!linkaccount`');
        }
        
        const rank = getRankFromMMR(account.mmr);
        const tierCodes = dataManager.getRoomCodesByTier(rank.tier);
        
        const embed = new EmbedBuilder()
            .setTitle(`${rank.emoji} ${rank.name} Rank Codes`)
            .setDescription(tierCodes.length > 0 ? 
                tierCodes.map(c => `**${c.code}** (${getTimeAgo(c.createdAt)})`).join('\n') :
                'No active codes in your tier. Create one in-game!')
            .setColor(0x00AAFF)
            .setTimestamp();
        
        try {
            await message.author.send({ embeds: [embed] });
            if (message.guild) {
                message.reply('Check your DMs for active codes!');
            }
        } catch (error) {
            message.reply('I couldn\'t send you a DM.');
        }
    }
    
    if (command === '!rank') {
        const targetUser = message.mentions.users.first() || message.author;
        const account = dataManager.getAccount(targetUser.id);
        
        if (!account) {
            return message.reply(`${targetUser.username} hasn't linked their account yet.`);
        }
        
        const rank = getRankFromMMR(account.mmr);
        const winRate = account.wins + account.losses > 0 ? 
            ((account.wins / (account.wins + account.losses)) * 100).toFixed(1) : 0;
        
        const embed = new EmbedBuilder()
            .setTitle(`${rank.emoji} ${targetUser.username}'s Rank`)
            .addFields(
                { name: 'Rank', value: rank.name, inline: true },
                { name: 'MMR', value: account.mmr.toString(), inline: true },
                { name: 'Tier', value: rank.tier.toUpperCase(), inline: true },
                { name: 'Wins', value: account.wins.toString(), inline: true },
                { name: 'Losses', value: account.losses.toString(), inline: true },
                { name: 'Win Rate', value: `${winRate}%`, inline: true }
            )
            .setColor(0xFFAA00)
            .setThumbnail(targetUser.displayAvatarURL())
            .setTimestamp();
        
        message.reply({ embeds: [embed] });
    }
    
    if (command === '!mmr') {
        if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return message.reply('You need administrator permissions.');
        }
        
        const targetUser = message.mentions.users.first();
        const mmrChange = parseInt(args[2]);
        
        if (!targetUser || isNaN(mmrChange)) {
            return message.reply('Usage: `!mmr @user <amount>`');
        }
        
        const account = dataManager.getAccount(targetUser.id);
        if (!account) {
            return message.reply('That user hasn\'t linked their account.');
        }
        
        dataManager.updateMMR(targetUser.id, mmrChange);
        const newRank = await updateUserRoles(message.guild, targetUser.id, account.mmr + mmrChange);
        
        message.reply(`Updated ${targetUser.username}'s MMR by ${mmrChange}. New: ${account.mmr + mmrChange} (${newRank.name})`);
        
        const trackingChannel = client.channels.cache.get(CONFIG.CHANNELS.MMR_TRACKING);
        if (trackingChannel) {
            trackingChannel.send(`<@${targetUser.id}> ${mmrChange > 0 ? '+' : ''}${mmrChange} MMR (Admin: ${message.author.tag})`);
        }
    }
    
    if (command === '!leaderboard' || command === '!lb') {
        const allAccounts = Object.entries(dataManager.accounts)
            .map(([discordId, data]) => ({ discordId, ...data }))
            .sort((a, b) => b.mmr - a.mmr)
            .slice(0, 10);
        
        if (allAccounts.length === 0) {
            return message.reply('No players ranked yet.');
        }
        
        const leaderboardText = allAccounts.map((account, index) => {
            const rank = getRankFromMMR(account.mmr);
            return `**${index + 1}.** <@${account.discordId}> - ${rank.emoji} ${account.mmr} MMR`;
        }).join('\n');
        
        const embed = new EmbedBuilder()
            .setTitle('🏆 Ranked Leaderboard')
            .setDescription(leaderboardText)
            .setColor(0xFFD700)
            .setTimestamp();
        
        message.reply({ embeds: [embed] });
    }
});

// ============================================
// REPORT MONITORING
// ============================================
client.on('messageCreate', async (message) => {
    if (message.channelId !== CONFIG.CHANNELS.REPORTS) return;
    if (message.author.bot) return;
    
    if (message.content.includes(CONFIG.TARGET_PLAYFAB_ID) || 
        (message.embeds.length > 0 && message.embeds[0].description?.includes(CONFIG.TARGET_PLAYFAB_ID))) {
        
        const notificationChannel = client.channels.cache.get(CONFIG.CHANNELS.REPORT_NOTIFICATIONS);
        if (notificationChannel) {
            const embed = new EmbedBuilder()
                .setTitle('⚠️ Report Detected')
                .setDescription(`A report was detected in <#${CONFIG.CHANNELS.REPORTS}>`)
                .addFields(
                    { name: 'PlayFab ID', value: CONFIG.TARGET_PLAYFAB_ID },
                    { name: 'Reporter', value: message.author.tag },
                    { name: 'Link', value: message.url }
                )
                .setColor(0xFF0000)
                .setTimestamp();
            
            await notificationChannel.send({ embeds: [embed] });
            
            const account = dataManager.getAccountByPhotonId(CONFIG.TARGET_PLAYFAB_ID);
            if (account) {
                dataManager.updateMMR(account.discordId, CONFIG.MMR_SETTINGS.REPORT_MMR_PENALTY);
                await updateUserRoles(message.guild, account.discordId, account.mmr);
                
                const trackingChannel = client.channels.cache.get(CONFIG.CHANNELS.MMR_TRACKING);
                if (trackingChannel) {
                    trackingChannel.send(`<@${account.discordId}> ${CONFIG.MMR_SETTINGS.REPORT_MMR_PENALTY} MMR (Report penalty)`);
                }
            }
        }
    }
});

// ============================================
// API ENDPOINTS
// ============================================
app.post('/api/room/create', async (req, res) => {
    try {
        const { code, tier, photonId, discordId } = req.body;
        
        const account = dataManager.getAccount(discordId);
        if (!account) {
            return res.status(403).json({ error: 'Account not linked' });
        }
        
        if (!canAccessTier(account.mmr, tier.toLowerCase())) {
            return res.status(403).json({ error: 'Cannot access this tier' });
        }
        
        dataManager.addRoomCode(code, tier.toLowerCase(), discordId);
        
        const codesChannel = client.channels.cache.get(CONFIG.CHANNELS.CODES);
        if (codesChannel) {
            const rank = getRankFromMMR(account.mmr);
            const embed = new EmbedBuilder()
                .setTitle(`${rank.emoji} New ${tier} Rank Room`)
                .setDescription(`**Room Code:** ${code}`)
                .addFields(
                    { name: 'Tier', value: tier.toUpperCase(), inline: true },
                    { name: 'Created By', value: `<@${discordId}>`, inline: true }
                )
                .setColor(tier === 'HIGH' ? 0xFF0000 : tier === 'MID' ? 0xFFAA00 : 0x00AAFF)
                .setTimestamp();
            
            await codesChannel.send({ embeds: [embed] });
        }
        
        res.json({ success: true, code });
    } catch (error) {
        console.error('Error creating room:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/api/account/confirm-link', async (req, res) => {
    try {
        const { linkCode, photonNickname } = req.body;
        
        // linkCode comes as "12345" from the room name "LINK12345"
        const linkData = dataManager.getLinkingCode(linkCode);
        if (!linkData) {
            return res.status(404).json({ error: 'Invalid or expired linking code' });
        }
        
        // Get the player's actual Photon nickname (the one joining the room)
        dataManager.createAccount(linkData.discordId, photonNickname);
        dataManager.removeLinkingCode(linkCode);
        
        const guilds = client.guilds.cache;
        for (const guild of guilds.values()) {
            try {
                await updateUserRoles(guild, linkData.discordId, CONFIG.MMR_SETTINGS.STARTING_MMR);
            } catch (error) {
                console.error('Error assigning role:', error);
            }
        }
        
        try {
            const user = await client.users.fetch(linkData.discordId);
            const rank = getRankFromMMR(CONFIG.MMR_SETTINGS.STARTING_MMR);
            
            const embed = new EmbedBuilder()
                .setTitle('✅ Account Linked!')
                .setDescription('Your Discord account has been successfully linked!')
                .addFields(
                    { name: 'Photon Nickname', value: photonNickname },
                    { name: 'Starting Rank', value: `${rank.emoji} ${rank.name}` },
                    { name: 'Starting MMR', value: CONFIG.MMR_SETTINGS.STARTING_MMR.toString() }
                )
                .setColor(0x00FF00)
                .setTimestamp();
            
            await user.send({ embeds: [embed] });
        } catch (error) {
            console.error('Error sending DM:', error);
        }
        
        res.json({ 
            success: true, 
            photonId: photonNickname,
            discordId: linkData.discordId
        });
    } catch (error) {
        console.error('Error confirming link:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/api/account/status', (req, res) => {
    try {
        const { photonNickname } = req.query;
        const account = dataManager.getAccountByPhotonId(photonNickname);
        
        if (account) {
            res.json({
                linked: 'true',
                photonId: account.photonId,
                discordId: account.discordId
            });
        } else {
            res.json({ linked: 'false' });
        }
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/api/room/codes', (req, res) => {
    try {
        const codes = dataManager.getAllActiveCodes();
        res.json({ codes });
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ============================================
// START BOT
// ============================================
client.once('ready', () => {
    console.log(`✅ Bot logged in as ${client.user.tag}`);
    
    app.listen(CONFIG.API_PORT, () => {
        console.log(`✅ API server running on http://localhost:${CONFIG.API_PORT}`);
    });
});

client.login(CONFIG.DISCORD_TOKEN);
