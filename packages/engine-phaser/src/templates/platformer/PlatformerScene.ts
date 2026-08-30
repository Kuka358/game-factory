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


const GOAL_ROLE =
    "goal";


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


        this.physics.world.setBounds(
            0,
            0,
            this.spec
                .platformer
                .level_length,
            height +
                600
        );


        this.cameras.main.setBounds(
            0,
            0,
            this.spec
                .platformer
                .level_length,
            height
        );


        this.platforms =
            this.physics.add
                .staticGroup();


        this.createPlatforms(
            height
        );


        this.createPlayer(
            height
        );


        this.createGoal(
            height
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
        height:
            number
    ): void {
        const levelLength =
            this.spec
                .platformer
                .level_length;


        const platformWidth =
            300;


        const platformHeight =
            48;


        const gap =
            90;


        const step =
            platformWidth +
            gap;


        const yPattern = [
            height -
                70,

            height -
                145,

            height -
                95,

            height -
                205,

            height -
                120
        ];


        let index =
            0;


        for (
            let x =
                platformWidth /
                2;

            x <
                levelLength;

            x +=
                step
        ) {
            const y =
                yPattern[
                    index %
                    yPattern.length
                ] ??
                height -
                    70;


            const platform =
                this.platforms
                    .create(
                        x,
                        y,
                        "__WHITE"
                    ) as
                    Phaser.Physics.Arcade.Image;


            platform
                .setDisplaySize(
                    platformWidth,
                    platformHeight
                )
                .setTint(
                    0x666666
                )
                .refreshBody();


            index +=
                1;
        }
    }


    private createPlayer(
        height:
            number
    ): void {
        this.player =
            this.physics.add.image(
                120,
                height -
                    160,

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
        height:
            number
    ): void {
        const x =
            Math.max(
                500,

                this.spec
                    .platformer
                    .level_length -
                    180
            );


        const y =
            height -
            180;


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
                                : 0
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