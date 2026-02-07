// Discord Bot for Gorilla Tag MMR System
// Handles account linking, rank management, and PlayFab integration

const { Client, GatewayIntentBits, Events, Partials } = require('discord.js');
const PlayFab = require('playfab-sdk/Scripts/PlayFab/PlayFab');
const PlayFabServer = require('playfab-sdk/Scripts/PlayFab/PlayFabServer');
require('dotenv').config();

// ============================================================================
// HARDCODED CONFIG (must match C# plugin exactly)
// ============================================================================

const ROLES = {
    BRONZE: '1468435586116489388',
    SILVER: '1468435649756659712',
    GOLD: '1468435997837754419',
    DIAMOND: '1468436117404651552',
    SAPPHIRE: '1468436338725490881',
    RUBY: '1468436386032914534',
    COMP_BANNED: '1468452209950724116'
};

const RANK_CONFIG = [
    { name: 'Bronze', mmrRange: [0, 499], tier: 'low', emoji: '🥉', roleId: ROLES.BRONZE },
    { name: 'Silver', mmrRange: [500, 999], tier: 'low', emoji: '🥈', roleId: ROLES.SILVER },
    { name: 'Gold', mmrRange: [1000, 1999], tier: 'mid', emoji: '🥇', roleId: ROLES.GOLD },
    { name: 'Diamond', mmrRange: [2000, 2999], tier: 'mid', emoji: '💎', roleId: ROLES.DIAMOND },
    { name: 'Sapphire', mmrRange: [3000, 4999], tier: 'high', emoji: '💠', roleId: ROLES.SAPPHIRE },
    { name: 'Ruby', mmrRange: [5000, 99999], tier: 'high', emoji: '🔴', roleId: ROLES.RUBY }
];

const MMR_SETTINGS = {
    STARTING_MMR: 200
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function getRankFromMMR(mmr) {
    for (const rank of RANK_CONFIG) {
        if (mmr >= rank.mmrRange[0] && mmr <= rank.mmrRange[1]) {
            return rank;
        }
    }
    return RANK_CONFIG[0]; // Default to Bronze
}

function validateLinkCode(code) {
    // Must be 6 digits
    return /^\d{6}$/.test(code);
}

// ============================================================================
// PLAYFAB SETUP
// ============================================================================

PlayFab.settings.titleId = process.env.PLAYFAB_TITLE_ID;
PlayFab.settings.developerSecretKey = process.env.PLAYFAB_SECRET_KEY;

// ============================================================================
// PLAYFAB API HELPERS
// ============================================================================

function getPlayFabUserData(playFabId) {
    return new Promise((resolve, reject) => {
        const request = {
            PlayFabId: playFabId,
            Keys: ['discordId', 'mmr', 'rank', 'tier', 'linkCode', 'linkCodeExpiry', 'banned']
        };

        PlayFabServer.GetUserData(request, (error, result) => {
            if (error) {
                console.error('PlayFab GetUserData error:', error);
                reject(error);
            } else {
                const data = {};
                if (result.data.Data) {
                    for (const key in result.data.Data) {
                        data[key] = result.data.Data[key].Value;
                    }
                }
                resolve(data);
            }
        });
    });
}

function updatePlayFabUserData(playFabId, dataToUpdate) {
    return new Promise((resolve, reject) => {
        const request = {
            PlayFabId: playFabId,
            Data: dataToUpdate
        };

        PlayFabServer.UpdateUserData(request, (error, result) => {
            if (error) {
                console.error('PlayFab UpdateUserData error:', error);
                reject(error);
            } else {
                resolve(result);
            }
        });
    });
}

async function findPlayerByLinkCode(linkCode) {
    // Search through all players for matching link code
    // Note: This is a simplified approach. In production, consider using TitleData
    // to maintain a temporary code->PlayFabId mapping for efficiency
    
    // For now, we'll use GetUserData with the assumption that the plugin
    // will store the code in a retrievable way. This function should be called
    // when we have the PlayFabId from the plugin's storage mechanism.
    
    // Since PlayFab doesn't have a native "search all users" API without pagination,
    // we'll rely on the plugin sending the PlayFabId to TitleData temporarily
    return new Promise((resolve, reject) => {
        PlayFabServer.GetTitleData({ Keys: [`linkCode_${linkCode}`] }, (error, result) => {
            if (error) {
                reject(error);
            } else {
                const playFabId = result.data.Data[`linkCode_${linkCode}`];
                resolve(playFabId || null);
            }
        });
    });
}

function storeLinkCodeMapping(linkCode, playFabId) {
    return new Promise((resolve, reject) => {
        PlayFabServer.SetTitleData({
            Key: `linkCode_${linkCode}`,
            Value: playFabId
        }, (error, result) => {
            if (error) reject(error);
            else resolve(result);
        });
    });
}

function removeLinkCodeMapping(linkCode) {
    return new Promise((resolve, reject) => {
        PlayFabServer.SetTitleData({
            Key: `linkCode_${linkCode}`,
            Value: null
        }, (error, result) => {
            if (error) reject(error);
            else resolve(result);
        });
    });
}

// ============================================================================
// DISCORD ROLE MANAGEMENT
// ============================================================================

async function updateUserRoles(member, newRoleId, isBanned = false) {
    try {
        // Remove all rank roles
        const allRankRoles = Object.values(ROLES).filter(r => r !== ROLES.COMP_BANNED);
        for (const roleId of allRankRoles) {
            if (member.roles.cache.has(roleId)) {
                await member.roles.remove(roleId);
            }
        }

        // Add new rank role (unless banned)
        if (!isBanned && newRoleId) {
            await member.roles.add(newRoleId);
        }

        // Handle banned role
        if (isBanned) {
            await member.roles.add(ROLES.COMP_BANNED);
        } else {
            if (member.roles.cache.has(ROLES.COMP_BANNED)) {
                await member.roles.remove(ROLES.COMP_BANNED);
            }
        }

        return true;
    } catch (error) {
        console.error('Error updating roles:', error);
        return false;
    }
}

// ============================================================================
// RATE LIMITING
// ============================================================================

const rateLimits = new Map();

function checkRateLimit(userId, command, limitMs = 60000) {
    const key = `${userId}_${command}`;
    const now = Date.now();
    
    if (rateLimits.has(key)) {
        const lastUsed = rateLimits.get(key);
        if (now - lastUsed < limitMs) {
            return false;
        }
    }
    
    rateLimits.set(key, now);
    return true;
}

// ============================================================================
// DISCORD CLIENT SETUP
// ============================================================================

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.MessageContent
    ],
    partials: [
        Partials.Channel,
        Partials.Message
    ]
});

// ============================================================================
// COMMAND HANDLERS
// ============================================================================

async function handleLinkCommand(message, args) {
    if (!checkRateLimit(message.author.id, 'link')) {
        return message.reply('⏳ Please wait 1 minute between link attempts.');
    }

    if (args.length === 0) {
        return message.reply('❌ Usage: `!link <code>`\nEnter the 6-digit code displayed in-game.');
    }

    const linkCode = args[0].trim();

    if (!validateLinkCode(linkCode)) {
        return message.reply('❌ Invalid code format. Please enter a 6-digit code.');
    }

    try {
        await message.reply('🔍 Verifying code...');

        // Find the PlayFabId associated with this code
        const playFabId = await findPlayerByLinkCode(linkCode);

        if (!playFabId) {
            return message.reply('❌ Invalid or expired code. Please generate a new code in-game.');
        }

        // Get current user data
        const userData = await getPlayFabUserData(playFabId);

        // Check if already linked
        if (userData.discordId && userData.discordId !== '') {
            return message.reply('❌ This account is already linked. Use `!unlink` first if you need to relink.');
        }

        // Verify the link code matches and hasn't expired
        if (userData.linkCode !== linkCode) {
            return message.reply('❌ Code mismatch. Please try again.');
        }

        const expiry = parseInt(userData.linkCodeExpiry || '0');
        if (Date.now() > expiry) {
            return message.reply('❌ Code expired. Please generate a new code in-game.');
        }

        // Link the account
        const mmr = parseInt(userData.mmr) || MMR_SETTINGS.STARTING_MMR;
        const rank = getRankFromMMR(mmr);
        const isBanned = userData.banned === 'true';

        await updatePlayFabUserData(playFabId, {
            discordId: message.author.id,
            mmr: mmr.toString(),
            rank: rank.name,
            tier: rank.tier,
            linkCode: '', // Clear the code
            linkCodeExpiry: '0'
        });

        // Remove the temporary mapping
        await removeLinkCodeMapping(linkCode);

        // Assign Discord roles
        const guild = await client.guilds.fetch(process.env.GUILD_ID);
        const member = await guild.members.fetch(message.author.id);
        
        await updateUserRoles(member, rank.roleId, isBanned);

        await message.reply(
            `✅ **Account Linked Successfully!**\n\n` +
            `${rank.emoji} **Rank:** ${rank.name}\n` +
            `📊 **MMR:** ${mmr}\n` +
            `🎯 **Tier:** ${rank.tier.toUpperCase()}\n\n` +
            `Your Discord roles have been updated. Use \`!status\` to check your stats anytime.`
        );

        console.log(`[LINK] ${message.author.tag} (${message.author.id}) linked to PlayFabId: ${playFabId}, MMR: ${mmr}, Rank: ${rank.name}`);

    } catch (error) {
        console.error('Error in link command:', error);
        await message.reply('❌ An error occurred while linking your account. Please try again later.');
    }
}

async function handleUnlinkCommand(message) {
    try {
        // Search for the user's PlayFabId by their Discord ID
        // This requires iterating or using a reverse lookup in TitleData
        // For efficiency, we'll use TitleData to store Discord->PlayFab mappings
        
        await message.reply('🔍 Searching for your linked account...');

        const playFabId = await new Promise((resolve, reject) => {
            PlayFabServer.GetTitleData({ Keys: [`discord_${message.author.id}`] }, (error, result) => {
                if (error) reject(error);
                else resolve(result.data.Data[`discord_${message.author.id}`] || null);
            });
        });

        if (!playFabId) {
            return message.reply('❌ No linked account found.');
        }

        // Unlink the account
        await updatePlayFabUserData(playFabId, {
            discordId: ''
        });

        // Remove the reverse mapping
        await new Promise((resolve, reject) => {
            PlayFabServer.SetTitleData({
                Key: `discord_${message.author.id}`,
                Value: null
            }, (error, result) => {
                if (error) reject(error);
                else resolve(result);
            });
        });

        // Remove all rank roles
        const guild = await client.guilds.fetch(process.env.GUILD_ID);
        const member = await guild.members.fetch(message.author.id);
        
        const allRoles = Object.values(ROLES);
        for (const roleId of allRoles) {
            if (member.roles.cache.has(roleId)) {
                await member.roles.remove(roleId);
            }
        }

        await message.reply('✅ Account unlinked successfully. Your Discord roles have been removed.');
        console.log(`[UNLINK] ${message.author.tag} (${message.author.id}) unlinked from PlayFabId: ${playFabId}`);

    } catch (error) {
        console.error('Error in unlink command:', error);
        await message.reply('❌ An error occurred while unlinking your account.');
    }
}

async function handleStatusCommand(message) {
    try {
        await message.reply('🔍 Fetching your stats...');

        const playFabId = await new Promise((resolve, reject) => {
            PlayFabServer.GetTitleData({ Keys: [`discord_${message.author.id}`] }, (error, result) => {
                if (error) reject(error);
                else resolve(result.data.Data[`discord_${message.author.id}`] || null);
            });
        });

        if (!playFabId) {
            return message.reply('❌ No linked account found. Use `!link <code>` to link your account.');
        }

        const userData = await getPlayFabUserData(playFabId);
        const mmr = parseInt(userData.mmr) || MMR_SETTINGS.STARTING_MMR;
        const rank = getRankFromMMR(mmr);
        const isBanned = userData.banned === 'true';

        let statusMsg = `📊 **Your Stats**\n\n` +
            `${rank.emoji} **Rank:** ${rank.name}\n` +
            `📈 **MMR:** ${mmr}\n` +
            `🎯 **Tier:** ${rank.tier.toUpperCase()}\n` +
            `🎮 **PlayFab ID:** ${playFabId}\n`;

        if (isBanned) {
            statusMsg += `\n⛔ **Status:** COMP BANNED`;
        }

        // Add tier info
        statusMsg += `\n\n**Lobby Access:** ${rank.tier === 'low' ? 'L' : rank.tier === 'mid' ? 'M' : 'H'} rooms`;

        await message.reply(statusMsg);

    } catch (error) {
        console.error('Error in status command:', error);
        await message.reply('❌ An error occurred while fetching your stats.');
    }
}

async function handleRefreshCommand(message) {
    try {
        await message.reply('🔄 Refreshing your rank...');

        const playFabId = await new Promise((resolve, reject) => {
            PlayFabServer.GetTitleData({ Keys: [`discord_${message.author.id}`] }, (error, result) => {
                if (error) reject(error);
                else resolve(result.data.Data[`discord_${message.author.id}`] || null);
            });
        });

        if (!playFabId) {
            return message.reply('❌ No linked account found.');
        }

        const userData = await getPlayFabUserData(playFabId);
        const mmr = parseInt(userData.mmr) || MMR_SETTINGS.STARTING_MMR;
        const rank = getRankFromMMR(mmr);
        const isBanned = userData.banned === 'true';

        // Update rank and tier in PlayFab
        await updatePlayFabUserData(playFabId, {
            rank: rank.name,
            tier: rank.tier
        });

        // Update Discord roles
        const guild = await client.guilds.fetch(process.env.GUILD_ID);
        const member = await guild.members.fetch(message.author.id);
        
        await updateUserRoles(member, rank.roleId, isBanned);

        await message.reply(
            `✅ **Rank Refreshed!**\n\n` +
            `${rank.emoji} **Rank:** ${rank.name}\n` +
            `📊 **MMR:** ${mmr}\n` +
            `🎯 **Tier:** ${rank.tier.toUpperCase()}`
        );

        console.log(`[REFRESH] ${message.author.tag} refreshed to ${rank.name} (MMR: ${mmr})`);

    } catch (error) {
        console.error('Error in refresh command:', error);
        await message.reply('❌ An error occurred while refreshing your rank.');
    }
}

// ============================================================================
// DISCORD EVENT HANDLERS
// ============================================================================

client.once(Events.ClientReady, () => {
    console.log('✅ Discord bot ready!');
    console.log(`Logged in as ${client.user.tag}`);
    console.log(`Guild ID: ${process.env.GUILD_ID}`);
    console.log(`PlayFab Title ID: ${process.env.PLAYFAB_TITLE_ID}`);
});

client.on(Events.MessageCreate, async (message) => {
    // Ignore bot messages
    if (message.author.bot) return;

    // Only respond to DMs
    if (!message.guild && message.content.startsWith('!')) {
        const args = message.content.slice(1).trim().split(/\s+/);
        const command = args.shift().toLowerCase();

        switch (command) {
            case 'link':
                await handleLinkCommand(message, args);
                break;
            case 'unlink':
                await handleUnlinkCommand(message);
                break;
            case 'status':
                await handleStatusCommand(message);
                break;
            case 'refresh':
                await handleRefreshCommand(message);
                break;
            case 'help':
                await message.reply(
                    `**🎮 Gorilla Tag MMR Bot Commands**\n\n` +
                    `\`!link <code>\` - Link your PlayFab account with the 6-digit code from in-game\n` +
                    `\`!unlink\` - Unlink your account\n` +
                    `\`!status\` - View your current MMR and rank\n` +
                    `\`!refresh\` - Update your Discord roles based on current MMR\n` +
                    `\`!help\` - Show this help message\n\n` +
                    `**Ranks:** 🥉 Bronze (0-499) • 🥈 Silver (500-999) • 🥇 Gold (1000-1999) • 💎 Diamond (2000-2999) • 💠 Sapphire (3000-4999) • 🔴 Ruby (5000+)\n` +
                    `**Tiers:** Low (L rooms) • Mid (M rooms) • High (H rooms)`
                );
                break;
            default:
                await message.reply('❌ Unknown command. Use `!help` for a list of commands.');
        }
    }
});

client.on(Events.Error, (error) => {
    console.error('Discord client error:', error);
});

// ============================================================================
// HELPER FUNCTION FOR PLUGIN TO CALL VIA TITLEDATA
// ============================================================================

// The plugin will store link codes in TitleData as: linkCode_XXXXXX -> PlayFabId
// And reverse mappings as: discord_DISCORDID -> PlayFabId
// This allows efficient lookups in both directions

// ============================================================================
// START BOT
// ============================================================================

client.login(process.env.DISCORD_TOKEN);

// Handle process termination
process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down bot...');
    client.destroy();
    process.exit(0);
});

process.on('unhandledRejection', (error) => {
    console.error('Unhandled promise rejection:', error);
});

console.log('🚀 Starting Gorilla Tag MMR Discord Bot...');
