"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Poru = void 0;
const Node_1 = require("./Node");
const Player_1 = require("./Player");
const events_1 = require("events");
const config_1 = require("./config");
const undici_1 = require("undici");
const Response_1 = require("./guild/Response");
class Poru extends events_1.EventEmitter {
    client;
    _nodes;
    options;
    nodes;
    players;
    userId;
    version;
    isActivated;
    send;
    constructor(client, nodes, options) {
        super();
        this.client = client;
        this._nodes = nodes;
        this.nodes = new Map();
        this.players = new Map();
        this.options = options;
        this.userId = null;
        this.version = config_1.Config.version;
        this.isActivated = false;
        this.send = null;
    }
    init(client) {
        if (this.isActivated)
            return this;
        this.userId = client.user.id;
        this._nodes.forEach((node) => this.addNode(node));
        this.isActivated = true;
        switch (this.options.library) {
            case "discord.js": {
                this.send = (packet) => {
                    const guild = client.guilds.cache.get(packet.d.guild_id);
                    if (guild)
                        guild.shard?.send(packet);
                };
                client.on("raw", async (packet) => {
                    await this.packetUpdate(packet);
                });
                break;
            }
            case "eris": {
                this.send = (packet) => {
                    const guild = client.guilds.get(packet.d.guild_id);
                    if (guild)
                        guild.shard.sendWS(packet?.op, packet?.d);
                };
                client.on("rawWS", async (packet) => {
                    await this.packetUpdate(packet);
                });
                break;
            }
            case "oceanic": {
                this.send = (packet) => {
                    const guild = client.guilds.get(packet.d.guild_id);
                    if (guild)
                        guild.shard.send(packet);
                };
                client.on("packet", async (packet) => {
                    await this.packetUpdate(packet);
                });
                break;
            }
        }
    }
    packetUpdate(packet) {
        if (!["VOICE_STATE_UPDATE", "VOICE_SERVER_UPDATE"].includes(packet.t))
            return;
        const player = this.players.get(packet.d.guild_id);
        if (!player)
            return;
        if (packet.t === "VOICE_SERVER_UPDATE") {
            player.connection.setServersUpdate(packet.d);
        }
        if (packet.t === "VOICE_STATE_UPDATE") {
            if (packet.d.user_id !== this.userId)
                return;
            player.connection.setStateUpdate(packet.d);
        }
    }
    addNode(options) {
        const node = new Node_1.Node(this, options, this.options);
        this.nodes.set(options.name, node);
        node.connect();
        return node;
    }
    removeNode(identifier) {
        const node = this.nodes.get(identifier);
        if (!node)
            return;
        node.disconnect();
        this.nodes.delete(identifier);
    }
    getNodeByRegion(region) {
        return [...this.nodes.values()]
            .filter((node) => node.isConnected && node.regions.includes(region.toLowerCase()))
            .sort((a, b) => {
            const aLoad = a.stats.cpu
                ? (a.stats.cpu.systemLoad / a.stats.cpu.cores) * 100
                : 0;
            const bLoad = b.stats.cpu
                ? (b.stats.cpu.systemLoad / b.stats.cpu.cores) * 100
                : 0;
            return aLoad - bLoad;
        });
    }
    getNode(identifier = "auto") {
        if (!this.nodes.size)
            throw new Error(`No nodes avaliable currently`);
        //  if (identifier === "auto") return this.leastUsedNodes;
        const node = this.nodes.get(identifier);
        if (!node)
            throw new Error("The node identifier you provided is not found");
        if (!node.isConnected)
            node.connect();
        return node;
    }
    createConnection(options) {
        const player = this.players.get(options.guildId);
        if (player)
            return player;
        if (this.leastUsedNodes.length === 0)
            throw new Error("[Poru Error] No nodes are avaliable");
        let node;
        if (options.region) {
            const region = this.getNodeByRegion(options.region)[0];
            node = this.nodes.get(region.name ||
                this.leastUsedNodes[0].name);
        }
        else {
            node = this.nodes.get(this.leastUsedNodes[0].name);
        }
        if (!node)
            throw new Error("[Poru Error] No nodes are avalible");
        return this.createPlayer(node, options);
    }
    createPlayer(node, options) {
        const player = new Player_1.Player(this, node, options);
        this.players.set(options.guildId, player);
        player.connect(options);
        return player;
    }
    removeConnection(guildId) {
        this.players.get(guildId)?.destroy();
    }
    get leastUsedNodes() {
        return [...this.nodes.values()]
            .filter((node) => node.isConnected)
            .sort((a, b) => a.penalties - b.penalties);
    }
    async resolve(query, source) {
        const node = this.leastUsedNodes[0];
        if (!node)
            throw new Error("No nodes are available.");
        const regex = /^https?:\/\//;
        if (regex.test(query)) {
            return node.rest.resolveQuery(`/v3/loadtracks?identifier=${encodeURIComponent(query)}`);
        }
        else {
            let track = `${source || "ytsearch"}:${query}`;
            return node.rest.resolveQuery(`/v3/loadtracks?identifier=${encodeURIComponent(track)}`);
        }
    }
    async fetchURL(node, track) {
        const result = await this.#fetch(node, "loadtracks", `identifier=${encodeURIComponent(track)}`);
        if (!result)
            throw new Error("[Poru Error] No tracks found.");
        return new Response_1.Response(result);
    }
    async fetchTrack(node, query, source) {
        let track = `${source || "ytsearch"}:${query}`;
        const result = await this.#fetch(node, "v3/loadtracks", `identifier=${encodeURIComponent(track)}`);
        if (!result)
            throw new Error("[Poru Error] No tracks found.");
        return new Response_1.Response(result);
    }
    #fetch(node, endpoint, param) {
        return (0, undici_1.fetch)(`${node.restURL}/${endpoint}?${param}`, {
            headers: {
                Authorization: node.password,
            },
        })
            .then((r) => r.json())
            .catch((e) => {
            throw new Error(`[Poru Error] Failed to fetch from the lavalink.\n  error: ${e}`);
        });
    }
    get(guildId) {
        return this.players.get(guildId);
    }
}
exports.Poru = Poru;
//# sourceMappingURL=Poru.js.map