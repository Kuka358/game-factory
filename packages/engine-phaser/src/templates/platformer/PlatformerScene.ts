import Phaser from "phaser";

import type {
    PlatformerGameSpec
} from "@game-factory/game-spec";

import type {
    GameContext
} from "@game-factory/runtime";

import type {
    PhaserInputService
} from "../../input/PhaserInputService.js";

import type {
    PhaserAssetRegistry
} from "../../assets/PhaserAssetRegistry.js";

import {
    generatePlatformerLevel,

    type PlatformerLevelLayout,
    type PlatformerLevelPlatform,
    type PlatformerLevelPoint
} from "./PlatformerLevelGenerator.js";


const GOAL_ROLE =
    "goal";

const LEVEL_TILES_ROLE =
    "level_tiles";

interface LevelTilesRenderConfig {
    textureKey:
        string;

    tileWidth:
        number;

    frameCount:
        number;
}


export class PlatformerScene
    extends Phaser.Scene
{
    private player!:
        Phaser.Physics.Arcade.Image;

    private platforms!:
        Phaser.Physics.Arcade.StaticGroup;

    private goal!:
        Phaser.Types.Physics.Arcade.ImageWithStaticBody;

    private finished =
        false;

    private dead =
        false;

    private levelLayout!:
        PlatformerLevelLayout;


    constructor(
        private readonly spec:
            PlatformerGameSpec,

        private readonly ctx:
            GameContext,

        private readonly inputAdapter:
            PhaserInputService,

        private readonly assets:
            PhaserAssetRegistry
    ) {
        super(
            "game"
        );
    }


    preload(): void {
        this.assets.preload(
            this
        );
    }


    create(): void {
        const {
            width,
            height
        } =
            this.scale;


        this.inputAdapter.attach(
            this
        );


        this.finished =
            false;

        this.dead =
            false;


        this.createBackground(
            width,
            height
        );

        this.levelLayout =
            generatePlatformerLevel({
                spec:
                    this.spec,

                viewportHeight:
                    height
            });


        this.physics.world.setBounds(
            0,
            0,
            this.levelLayout
                .worldWidth,
            height +
                600
        );


        this.cameras.main.setBounds(
            0,
            0,
            this.levelLayout
                .worldWidth,
            height
        );


        this.platforms =
            this.physics.add
                .staticGroup();


        this.createPlatforms(
            this.levelLayout
        );

        this.createPlayer(
            this.levelLayout
                .playerSpawn
        );

        this.createGoal(
            this.levelLayout
                .goal
        );


        this.physics.add.collider(
            this.player,
            this.platforms
        );


        this.physics.add.overlap(
            this.player,
            this.goal,
            () => {
                this.handleGoalReached();
            }
        );


        this.cameras.main
            .startFollow(
                this.player,
                true,
                0.1,
                0.1
            );


        this.cameras.main
            .setDeadzone(
                240,
                160
            );


        this.ctx.score.reset();


        const unregisterDebug =
            this.registerDebugState();


        this.events.once(
            Phaser.Scenes.Events
                .SHUTDOWN,
            () => {
                unregisterDebug();

                this.inputAdapter
                    .detach();
            }
        );


        void this.ctx
            .platform
            .gameReady()
            .catch(
                (
                    error:
                        unknown
                ) => {
                    console.error(
                        "[platform] gameReady failed",
                        error
                    );
                }
            );
    }


    update(): void {
        if (
            this.finished ||
            this.dead
        ) {
            if (
                this.ctx.input
                    .justPressed(
                        "jump"
                    )
            ) {
                this.scene.restart();
            }

            return;
        }


        this.updateMovement();


        if (
            this.ctx.input
                .justPressed(
                    "jump"
                )
        ) {
            this.tryJump();
        }


        if (
            this.player.y >
            this.scale.height +
                160
        ) {
            this.handleDeath();
        }
    }


    private updateMovement():
        void
    {
        const body =
            this.player.body as
                Phaser.Physics.Arcade.Body |
                null;


        if (
            !body
        ) {
            return;
        }


        const moveLeft =
            this.ctx.input
                .isPressed(
                    "move_left"
                );


        const moveRight =
            this.ctx.input
                .isPressed(
                    "move_right"
                );


        let velocityX =
            0;


        if (
            moveLeft &&
            !moveRight
        ) {
            velocityX =
                -this.spec
                    .player
                    .movement
                    .move_speed;
        } else if (
            moveRight &&
            !moveLeft
        ) {
            velocityX =
                this.spec
                    .player
                    .movement
                    .move_speed;
        }


        body.setVelocityX(
            velocityX
        );


        if (
            velocityX <
            0
        ) {
            this.player.setFlipX(
                true
            );
        } else if (
            velocityX >
            0
        ) {
            this.player.setFlipX(
                false
            );
        }
    }


    private tryJump():
        void
    {
        const body =
            this.player.body as
                Phaser.Physics.Arcade.Body |
                null;


        if (
            !body
        ) {
            return;
        }


        const grounded =
            body.blocked.down ||
            body.touching.down;


        if (
            !grounded
        ) {
            return;
        }


        body.setVelocityY(
            -this.spec
                .player
                .movement
                .jump_force
        );
    }


    private createBackground(
        width:
            number,

        height:
            number
    ): void {
        const background =
            this.add.image(
                width /
                    2,

                height /
                    2,

                this.assets
                    .getTextureKey(
                        "background"
                    )
            );


        background
            .setDisplaySize(
                width,
                height
            )
            .setScrollFactor(
                0
            )
            .setDepth(
                -100
            );
    }


    private createPlatforms(
        layout:
            PlatformerLevelLayout
    ): void {
        const levelTiles =
            this.getLevelTilesRenderConfig();


        for (
            const definition of
            layout.platforms
        ) {
            /*
            * Physics remains a deterministic rectangle.
            *
            * Generated tiles are visuals only. This means bad
            * artwork can never change collision geometry.
            */
            const platform =
                this.platforms
                    .create(
                        definition.x,
                        definition.y,
                        "__WHITE"
                    ) as
                    Phaser.Physics.Arcade.Image;


            platform
                .setDisplaySize(
                    definition.width,
                    definition.height
                )
                .setTint(
                    0x666666
                )
                .refreshBody();


            if (
                !levelTiles
            ) {
                continue;
            }


            /*
            * Collision object stays alive, but generated tiles
            * become the visible representation.
            */
            platform.setVisible(
                false
            );


            this.createPlatformTileVisuals(
                definition,
                levelTiles
            );
        }
    }

    private getLevelTilesRenderConfig():
        LevelTilesRenderConfig |
        undefined
    {
        if (
            !this.assets.has(
                LEVEL_TILES_ROLE
            )
        ) {
            return undefined;
        }


        const spritesheet =
            this.assets.getSpriteSheet(
                LEVEL_TILES_ROLE
            );


        if (
            !spritesheet
        ) {
            console.warn(
                [
                    `Asset "${LEVEL_TILES_ROLE}" exists`,
                    "but does not define spritesheet metadata."
                ].join(
                    " "
                )
            );

            return undefined;
        }


        const frameCount =
            spritesheet.columns *
            spritesheet.rows;


        if (
            spritesheet.frameWidth <=
                0 ||
            spritesheet.frameHeight <=
                0 ||
            frameCount <=
                0
        ) {
            console.warn(
                `Asset "${LEVEL_TILES_ROLE}" has invalid spritesheet metadata`
            );

            return undefined;
        }


        return {
            textureKey:
                this.assets
                    .getTextureKey(
                        LEVEL_TILES_ROLE
                    ),

            tileWidth:
                spritesheet
                    .frameWidth,

            frameCount
        };
    }

    private createPlatformTileVisuals(
        definition:
            PlatformerLevelPlatform,

        config:
            LevelTilesRenderConfig
    ): void {
        const left =
            definition.x -
            definition.width /
                2;

        const top =
            definition.y -
            definition.height /
                2;


        const columnCount =
            Math.ceil(
                definition.width /
                config.tileWidth
            );


        for (
            let column =
                0;

            column <
                columnCount;

            column +=
                1
        ) {
            const x =
                left +
                column *
                    config.tileWidth;


            const remainingWidth =
                definition.width -
                column *
                    config.tileWidth;


            const displayWidth =
                Math.min(
                    config.tileWidth,
                    remainingWidth
                );


            /*
            * Atlas generation orders frames so adjacent frames
            * have the best possible edge compatibility.
            *
            * Keep that order instead of choosing random frames.
            * Platform index only changes the starting point.
            */
            const frame =
                (
                    definition.index +
                    column
                ) %
                config.frameCount;


            const tile =
                this.add.image(
                    x,
                    top,

                    config.textureKey,
                    frame
                );


            tile
                .setOrigin(
                    0,
                    0
                )
                .setDisplaySize(
                    displayWidth,
                    definition.height
                )
                .setDepth(
                    -10
                );
        }
    }


    private createPlayer(
        spawn:
            PlatformerLevelPoint
    ): void {
        this.player =
            this.physics.add.image(
                spawn.x,
                spawn.y,

                this.assets
                    .getTextureKey(
                        "player"
                    )
            );


        this.fitImageToBox(
            this.player,
            56,
            64
        );


        const body =
            this.player.body as
                Phaser.Physics.Arcade.Body;


        body.setSize(
            this.player
                .displayWidth *
                0.72,

            this.player
                .displayHeight *
                0.88,

            true
        );


        this.player
            .setCollideWorldBounds(
                true
            );
    }


    private createGoal(
        point:
            PlatformerLevelPoint
    ): void {
        const {
            x,
            y
        } =
            point;


        if (
            this.assets.has(
                GOAL_ROLE
            )
        ) {
            this.goal =
                this.physics.add
                    .staticImage(
                        x,
                        y,

                        this.assets
                            .getTextureKey(
                                GOAL_ROLE
                            )
                    );


            this.fitImageToBox(
                this.goal,
                64,
                96
            );


            this.goal.refreshBody();

            return;
        }


        this.goal =
            this.physics.add
                .staticImage(
                    x,
                    y,
                    "__WHITE"
                );


        this.goal
            .setDisplaySize(
                40,
                96
            )
            .setTint(
                0x44cc66
            )
            .refreshBody();
    }


    private handleGoalReached():
        void
    {
        if (
            this.finished
        ) {
            return;
        }


        this.finished =
            true;


        this.player
            .setVelocity(
                0,
                0
            );


        this.physics.pause();


        this.add.text(
            this.scale.width /
                2,

            this.scale.height /
                2,

            "LEVEL COMPLETE",
            {
                fontSize:
                    "48px",

                color:
                    "#ffffff"
            }
        )
            .setOrigin(
                0.5
            )
            .setScrollFactor(
                0
            )
            .setDepth(
                1000
            );


        this.add.text(
            this.scale.width /
                2,

            this.scale.height /
                2 +
                64,

            "Press SPACE to restart",
            {
                fontSize:
                    "20px",

                color:
                    "#ffffff"
            }
        )
            .setOrigin(
                0.5
            )
            .setScrollFactor(
                0
            )
            .setDepth(
                1000
            );


        this.ctx.events.emit(
            "game.over",
            {
                score:
                    this.ctx.score.get()
            }
        );
    }


    private handleDeath():
        void
    {
        if (
            this.dead
        ) {
            return;
        }


        this.dead =
            true;


        this.physics.pause();


        this.add.text(
            this.scale.width /
                2,

            this.scale.height /
                2,

            "YOU FELL",
            {
                fontSize:
                    "48px",

                color:
                    "#ffffff"
            }
        )
            .setOrigin(
                0.5
            )
            .setScrollFactor(
                0
            )
            .setDepth(
                1000
            );


        this.add.text(
            this.scale.width /
                2,

            this.scale.height /
                2 +
                64,

            "Press SPACE to restart",
            {
                fontSize:
                    "20px",

                color:
                    "#ffffff"
            }
        )
            .setOrigin(
                0.5
            )
            .setScrollFactor(
                0
            )
            .setDepth(
                1000
            );


        this.ctx.events.emit(
            "game.over",
            {
                score:
                    this.ctx.score.get()
            }
        );
    }


    private registerDebugState():
        () => void
    {
        return this.ctx.debug
            .setStateProvider(
                () => ({
                    ready:
                        true,

                    scene:
                        "game",

                    player: {
                        alive:
                            !this.dead,

                        x:
                            this.player.x,

                        y:
                            this.player.y
                    },

                    score:
                        this.ctx.score
                            .get(),

                    entities: {
                        platforms:
                            this.platforms
                                .getChildren()
                                .length,

                        goal:
                            this.goal.active
                                ? 1
                                : 0,

                        level_seed:
                            this.levelLayout
                                .seed,

                        level_width:
                            this.levelLayout
                                .worldWidth,
                    },

                    game_over:
                        this.dead ||
                        this.finished
                })
            );
    }


    private fitImageToBox(
        image:
            Phaser.GameObjects.Image,

        maxWidth:
            number,

        maxHeight:
            number
    ): void {
        const width =
            image.width;

        const height =
            image.height;


        if (
            width <=
                0 ||
            height <=
                0
        ) {
            return;
        }


        const scale =
            Math.min(
                maxWidth /
                    width,

                maxHeight /
                    height
            );


        image.setScale(
            scale
        );
    }
}