function spriteCase(
    id,
    profile,
    role,
    tags,
    extra = {}
) {
    return {
        id,
        profile,
        role,
        tags,
        uiKind:
            extra.uiKind
    };
}


export const benchmarkCases = [
    /*
     * CHARACTER — 12
     */

    spriteCase(
        "character-astronaut",
        "character",
        "player",
        [
            "astronaut",
            "white futuristic space suit",
            "space explorer",
            "human hero"
        ]
    ),

    spriteCase(
        "character-cowboy",
        "character",
        "player",
        [
            "western cowboy",
            "brown cowboy hat",
            "boots",
            "frontier hero"
        ]
    ),

    spriteCase(
        "character-knight",
        "character",
        "player",
        [
            "medieval knight",
            "steel plate armor",
            "fantasy hero"
        ]
    ),

    spriteCase(
        "character-wizard",
        "character",
        "player",
        [
            "fantasy wizard",
            "blue robe",
            "pointed wizard hat",
            "magic hero"
        ]
    ),

    spriteCase(
        "character-ninja",
        "character",
        "player",
        [
            "ninja warrior",
            "black ninja clothing",
            "masked stealth hero"
        ]
    ),

    spriteCase(
        "character-pirate",
        "character",
        "player",
        [
            "pirate captain",
            "tricorn hat",
            "pirate coat",
            "adventure hero"
        ]
    ),

    spriteCase(
        "character-robot-hero",
        "character",
        "player",
        [
            "friendly humanoid robot",
            "science fiction hero",
            "metal body",
            "glowing blue eyes"
        ]
    ),

    spriteCase(
        "character-elf-archer",
        "character",
        "player",
        [
            "elf archer",
            "green fantasy clothes",
            "pointed ears",
            "fantasy hero"
        ]
    ),

    spriteCase(
        "character-dwarf-miner",
        "character",
        "player",
        [
            "dwarf miner",
            "large beard",
            "mining helmet",
            "fantasy worker hero"
        ]
    ),

    spriteCase(
        "character-fox-adventurer",
        "character",
        "player",
        [
            "anthropomorphic fox adventurer",
            "orange fox",
            "small backpack",
            "cute game hero"
        ]
    ),

    spriteCase(
        "character-frog-knight",
        "character",
        "player",
        [
            "anthropomorphic frog knight",
            "small medieval armor",
            "green frog",
            "cute fantasy hero"
        ]
    ),

    spriteCase(
        "character-cyberpunk-runner",
        "character",
        "player",
        [
            "cyberpunk runner",
            "neon futuristic clothes",
            "human street runner",
            "science fiction hero"
        ]
    ),


    /*
     * NPC / ENEMIES — 12
     */

    spriteCase(
        "npc-space-monster",
        "npc",
        "enemy",
        [
            "hostile alien space monster",
            "one scary alien creature",
            "science fiction enemy"
        ]
    ),

    spriteCase(
        "npc-zombie",
        "npc",
        "enemy",
        [
            "zombie enemy",
            "undead human monster",
            "torn clothes",
            "horror game enemy"
        ]
    ),

    spriteCase(
        "npc-goblin",
        "npc",
        "enemy",
        [
            "green goblin",
            "fantasy enemy",
            "small hostile creature"
        ]
    ),

    spriteCase(
        "npc-dragon",
        "npc",
        "enemy",
        [
            "small fantasy dragon",
            "red dragon",
            "hostile monster",
            "full body"
        ]
    ),

    spriteCase(
        "npc-ghost",
        "npc",
        "enemy",
        [
            "ghost enemy",
            "floating spectral creature",
            "pale blue spirit",
            "horror game enemy"
        ]
    ),

    spriteCase(
        "npc-slime",
        "npc",
        "enemy",
        [
            "green slime monster",
            "gelatinous creature",
            "cute fantasy enemy"
        ]
    ),

    spriteCase(
        "npc-skeleton-warrior",
        "npc",
        "enemy",
        [
            "skeleton warrior",
            "undead fantasy enemy",
            "bones",
            "old armor"
        ]
    ),

    spriteCase(
        "npc-demon",
        "npc",
        "enemy",
        [
            "red demon monster",
            "horned fantasy enemy",
            "hostile creature"
        ]
    ),

    spriteCase(
        "npc-alien-insect",
        "npc",
        "enemy",
        [
            "alien insect monster",
            "science fiction creature",
            "six legged enemy",
            "single creature"
        ]
    ),

    spriteCase(
        "npc-stone-golem",
        "npc",
        "enemy",
        [
            "stone golem",
            "large rock creature",
            "fantasy enemy",
            "humanoid monster"
        ]
    ),

    spriteCase(
        "npc-robot-drone",
        "npc",
        "enemy",
        [
            "hostile combat robot",
            "science fiction enemy",
            "mechanical drone",
            "single robot"
        ]
    ),

    spriteCase(
        "npc-mushroom-monster",
        "npc",
        "enemy",
        [
            "walking mushroom monster",
            "fantasy creature",
            "hostile mushroom enemy"
        ]
    ),


    /*
     * OBSTACLES — 12
     */

    spriteCase(
        "obstacle-cactus",
        "obstacle",
        "obstacle",
        [
            "desert cactus",
            "single cactus",
            "western game obstacle"
        ]
    ),

    spriteCase(
        "obstacle-boulder",
        "obstacle",
        "obstacle",
        [
            "large round boulder",
            "single rock",
            "game obstacle"
        ]
    ),

    spriteCase(
        "obstacle-wooden-crate",
        "obstacle",
        "obstacle",
        [
            "wooden crate",
            "single shipping box",
            "game obstacle"
        ]
    ),

    spriteCase(
        "obstacle-barrel",
        "obstacle",
        "obstacle",
        [
            "wooden barrel",
            "single barrel",
            "physical game obstacle"
        ]
    ),

    spriteCase(
        "obstacle-spike-trap",
        "obstacle",
        "obstacle",
        [
            "single floor spike trap",
            "metal trap",
            "dangerous game obstacle"
        ]
    ),

    spriteCase(
        "obstacle-saw-blade",
        "obstacle",
        "obstacle",
        [
            "single circular saw blade",
            "metal hazard",
            "game obstacle"
        ]
    ),

    spriteCase(
        "obstacle-ice-block",
        "obstacle",
        "obstacle",
        [
            "single large ice block",
            "frozen obstacle",
            "blue ice"
        ]
    ),

    spriteCase(
        "obstacle-thorn-bush",
        "obstacle",
        "obstacle",
        [
            "single thorn bush",
            "dangerous plant obstacle",
            "sharp thorns"
        ]
    ),

    spriteCase(
        "obstacle-land-mine",
        "obstacle",
        "obstacle",
        [
            "single futuristic land mine",
            "mechanical hazard",
            "science fiction obstacle"
        ]
    ),

    spriteCase(
        "obstacle-barricade",
        "obstacle",
        "obstacle",
        [
            "single wooden barricade",
            "road blocking obstacle",
            "wooden barrier"
        ]
    ),

    spriteCase(
        "obstacle-fallen-log",
        "obstacle",
        "obstacle",
        [
            "single fallen tree log",
            "forest obstacle",
            "horizontal wooden log"
        ]
    ),

    spriteCase(
        "obstacle-stalagmite",
        "obstacle",
        "obstacle",
        [
            "single sharp cave stalagmite",
            "stone spike",
            "cave game obstacle"
        ]
    ),


    /*
     * ITEMS / PICKUPS — 12
     */

    spriteCase(
        "item-gold-coin",
        "item",
        "collectible",
        [
            "gold coin",
            "round collectible coin",
            "shiny treasure"
        ]
    ),

    spriteCase(
        "item-gem",
        "item",
        "collectible",
        [
            "blue gemstone",
            "single faceted gem",
            "valuable collectible"
        ]
    ),

    spriteCase(
        "item-health-potion",
        "item",
        "collectible",
        [
            "health potion",
            "single red potion bottle",
            "fantasy game item"
        ]
    ),

    spriteCase(
        "item-key",
        "item",
        "collectible",
        [
            "golden key",
            "single old fantasy key",
            "game collectible"
        ]
    ),

    spriteCase(
        "item-treasure-chest",
        "item",
        "collectible",
        [
            "small treasure chest",
            "closed wooden chest",
            "single game item"
        ]
    ),

    spriteCase(
        "item-scroll",
        "item",
        "collectible",
        [
            "rolled parchment scroll",
            "single fantasy scroll",
            "game item"
        ]
    ),

    spriteCase(
        "item-magic-crystal",
        "item",
        "collectible",
        [
            "purple magic crystal",
            "single glowing crystal",
            "fantasy collectible"
        ]
    ),

    spriteCase(
        "item-star",
        "item",
        "collectible",
        [
            "golden five pointed star",
            "single collectible star",
            "game pickup"
        ]
    ),

    spriteCase(
        "item-heart",
        "item",
        "collectible",
        [
            "red heart pickup",
            "single heart",
            "health collectible"
        ]
    ),

    spriteCase(
        "item-battery",
        "item",
        "collectible",
        [
            "futuristic energy battery",
            "single battery",
            "science fiction collectible"
        ]
    ),

    spriteCase(
        "item-sword",
        "item",
        "collectible",
        [
            "steel fantasy sword",
            "single sword",
            "game equipment item"
        ]
    ),

    spriteCase(
        "item-shield",
        "item",
        "collectible",
        [
            "medieval metal shield",
            "single shield",
            "fantasy equipment item"
        ]
    ),


    /*
     * UI ICONS — 12
     */

    spriteCase(
        "ui-score-star",
        "ui",
        "ui_icon",
        [
            "gold star symbol",
            "score icon",
            "simple game icon"
        ],
        {
            uiKind:
                "icon"
        }
    ),

    spriteCase(
        "ui-coin-icon",
        "ui",
        "ui_icon",
        [
            "gold coin symbol",
            "currency icon",
            "simple game UI icon"
        ],
        {
            uiKind:
                "icon"
        }
    ),

    spriteCase(
        "ui-heart-icon",
        "ui",
        "ui_icon",
        [
            "red heart symbol",
            "health icon",
            "simple game UI icon"
        ],
        {
            uiKind:
                "icon"
        }
    ),

    spriteCase(
        "ui-trophy-icon",
        "ui",
        "ui_icon",
        [
            "gold trophy symbol",
            "achievement icon",
            "simple game UI icon"
        ],
        {
            uiKind:
                "icon"
        }
    ),

    spriteCase(
        "ui-play-icon",
        "ui",
        "ui_icon",
        [
            "play triangle symbol",
            "play icon",
            "simple game UI icon"
        ],
        {
            uiKind:
                "icon"
        }
    ),

    spriteCase(
        "ui-pause-icon",
        "ui",
        "ui_icon",
        [
            "pause symbol",
            "two vertical bars",
            "simple game UI icon"
        ],
        {
            uiKind:
                "icon"
        }
    ),

    spriteCase(
        "ui-restart-icon",
        "ui",
        "ui_icon",
        [
            "circular restart arrow symbol",
            "restart icon",
            "simple game UI icon"
        ],
        {
            uiKind:
                "icon"
        }
    ),

    spriteCase(
        "ui-sound-icon",
        "ui",
        "ui_icon",
        [
            "speaker symbol",
            "sound icon",
            "simple game UI icon"
        ],
        {
            uiKind:
                "icon"
        }
    ),

    spriteCase(
        "ui-lightning-icon",
        "ui",
        "ui_icon",
        [
            "yellow lightning bolt symbol",
            "energy icon",
            "simple game UI icon"
        ],
        {
            uiKind:
                "icon"
        }
    ),

    spriteCase(
        "ui-shield-icon",
        "ui",
        "ui_icon",
        [
            "shield symbol",
            "armor icon",
            "simple game UI icon"
        ],
        {
            uiKind:
                "icon"
        }
    ),

    spriteCase(
        "ui-settings-icon",
        "ui",
        "ui_icon",
        [
            "gear symbol",
            "settings icon",
            "simple game UI icon"
        ],
        {
            uiKind:
                "icon"
        }
    ),

    spriteCase(
        "ui-map-marker-icon",
        "ui",
        "ui_icon",
        [
            "map location marker symbol",
            "location icon",
            "simple game UI icon"
        ],
        {
            uiKind:
                "icon"
        }
    )
];