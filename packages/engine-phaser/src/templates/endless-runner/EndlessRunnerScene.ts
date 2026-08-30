import Phaser from "phaser";

import type {
    EndlessRunnerGameSpec
} from "@game-factory/game-spec";

import type {
    GameContext,
    ScoreChangedEvent
} from "@game-factory/runtime";

import type {
    PhaserInputService
} from "../../input/PhaserInputService.js";

import type {
    PhaserAssetRegistry
} from "../../assets/PhaserAssetRegistry.js";

const COLLECTIBLE_ROLE =
    "collectible";

const SCORE_ICON_ROLE =
    "score_icon";

const COLLECTIBLE_SCORE_BONUS =
    10;

const COLLECTIBLE_SPAWN_INTERVAL_MS =
    2200;

const ENEMY_ROLE =
    "enemy";

const ENEMY_SPAWN_EVERY =
    3;

const GROUND_TILES_ROLE =
    "ground_tiles";

export class EndlessRunnerScene
    extends Phaser.Scene
{
    constructor(
        private readonly spec:
            EndlessRunnerGameSpec,

        private readonly ctx:
            GameContext,

        private readonly inputAdapter:
            PhaserInputService,

        private readonly assets:
            PhaserAssetRegistry
    ) {
        super("game");
    }

    // Runtime state

    private gameOver = false;
    private ready = false;

    private elapsedTimeMs = 0;
    private currentWorldSpeed = 0;
    private distance = 0;

    private collectibleBonusScore = 0;
    private hazardSpawnCount = 0;

    // Geometry

    private groundTop = 0;

    // Game objects

    private scoreText!:
        Phaser.GameObjects.Text;

    private scoreIcon?:
        Phaser.GameObjects.Image;

    private ground!:
        Phaser.GameObjects.Rectangle;

    private groundTileVisuals:
        Phaser.GameObjects.Image[] =
        [];

    private nextGroundFrame =
        0;

    private player!:
        Phaser.Physics.Arcade.Image;

    private obstacles!:
        Phaser.GameObjects.Group;

    private collectibles?:
        Phaser.GameObjects.Group;

    preload(): void {
        this.assets.preload(
            this
        );
    }

    create(): void {
        const {
            width,
            height
        } = this.scale;

        this.inputAdapter.attach(
            this
        );

        this.gameOver = false;
        this.ready = false;

        this.elapsedTimeMs = 0;

        this.currentWorldSpeed =
            this.spec.runner.world_speed;

        this.distance = 0;

        this.collectibleBonusScore =
            0;

        this.hazardSpawnCount =
            0;

        this.groundTileVisuals =
            [];

        this.nextGroundFrame =
            0;

        this.createBackground(
            width,
            height
        );

        this.createGround(
            width,
            height
        );

        this.createPlayer();

        this.obstacles =
            this.add.group();

        if (
            this.assets.has(
                COLLECTIBLE_ROLE
            )
        ) {
            this.collectibles =
                this.add.group();
        }

        this.createColliders();

        const unregisterDebugState =
            this.registerDebugState();

        this.createScoreHud();

        const unsubscribeScore =
            this.registerScoreEvents();

        this.ctx.score.reset();

        this.createObstacleTimer();

        this.createCollectibleTimer();

        this.events.once(
            Phaser.Scenes.Events.SHUTDOWN,
            () => {
                unsubscribeScore();
                unregisterDebugState();

                this.inputAdapter.detach();
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

    update(
        _time: number,
        delta: number
    ): void {
        this.updateReadyState();

        if (
            this.ctx.input.justPressed(
                "jump"
            )
        ) {
            this.handleJumpAction();
        }

        if (this.gameOver) {
            return;
        }

        this.updateRuntimeState(
            delta
        );

        this.updateGroundTileVisuals(
            delta
        );

        this.updateObstacleSpeeds();
        this.updateCollectibleSpeeds();
    }

    private createBackground(
        width: number,
        height: number
    ): void {
        const background =
            this.add.image(
                width / 2,
                height / 2,
                this.assets.getTextureKey(
                    "background"
                )
            );

        background
            .setDisplaySize(
                width,
                height
            )
            .setDepth(
                -100
            );
    }

    private createGround(
        width:
            number,

        height:
            number
    ): void {
        const groundHeight =
            120;


        this.groundTop =
            height -
            groundHeight;


        this.ground =
            this.add.rectangle(
                width /
                    2,

                this.groundTop +
                    groundHeight /
                        2,

                width,

                groundHeight,

                0x555555
            );


        this.ground.setDepth(
            -20
        );


        this.physics.add.existing(
            this.ground,
            true
        );


        if (
            this.assets.has(
                GROUND_TILES_ROLE
            )
        ) {
            this.createGroundTileVisuals(
                width
            );
        }
    }

    private createGroundTileVisuals(
        width:
            number
    ): void {
        const spritesheet =
            this.assets.getSpriteSheet(
                GROUND_TILES_ROLE
            );


        if (
            !spritesheet
        ) {
            console.warn(
                [
                    `Asset "${GROUND_TILES_ROLE}" exists`,
                    "but does not define spritesheet metadata."
                ].join(
                    " "
                )
            );

            return;
        }


        const frameCount =
            spritesheet.columns *
            spritesheet.rows;


        if (
            frameCount <=
            0
        ) {
            console.warn(
                `Asset "${GROUND_TILES_ROLE}" contains no frames`
            );

            return;
        }


        const textureKey =
            this.assets
                .getTextureKey(
                    GROUND_TILES_ROLE
                );


        const tileWidth =
            spritesheet
                .frameWidth;


        const tileHeight =
            spritesheet
                .frameHeight;


        const visibleColumns =
            Math.ceil(
                width /
                tileWidth
            ) +
            1;


        /*
        * For the first vertical slice the generated atlas
        * decorates the TOP surface of the existing physics
        * ground.
        *
        * The rectangle underneath continues filling the rest
        * of the 120px ground depth.
        */
        for (
            let column =
                0;

            column <
                visibleColumns;

            column +=
                1
        ) {
            const frame =
                this.takeNextGroundFrame(
                    frameCount
                );


            const tile =
                this.add.image(
                    column *
                        tileWidth,

                    this.groundTop,

                    textureKey,

                    frame
                );


            tile
                .setOrigin(
                    0,
                    0
                )
                .setDisplaySize(
                    tileWidth,
                    tileHeight
                )
                .setDepth(
                    -10
                );

            this.groundTileVisuals.push(
                tile
            );
        }
    }

    private takeNextGroundFrame(
        frameCount:
            number
    ): number {
        if (
            frameCount <=
            1
        ) {
            return 0;
        }


        const frame =
            this.nextGroundFrame %
            frameCount;


        this.nextGroundFrame =
            (
                this.nextGroundFrame +
                1
            ) %
            frameCount;


        return frame;
    }

    private createPlayer(): void {
        this.player =
            this.physics.add.image(
                140,
                0,

                this.assets.getTextureKey(
                    "player"
                )
            );

        this.fitImageToBox(
            this.player,
            56,
            64
        );

        this.player.setPosition(
            140,

            this.groundTop -
                this.player.displayHeight /
                    2
        );

        this.player
            .setCollideWorldBounds(
                true
            );

        this.configureBody(
            this.player,

            0.72,
            0.88
        );
    }

    private createColliders(): void {
        this.physics.add.collider(
            this.player,
            this.ground
        );

        this.physics.add.collider(
            this.player,
            this.obstacles,
            () => {
                this.handleGameOver();
            }
        );

        if (
            this.collectibles
        ) {
            this.physics.add.overlap(
                this.player,
                this.collectibles,
                (
                    _player,
                    collectible
                ) => {
                    this.collectCollectible(
                        collectible as
                            Phaser.Physics.Arcade.Image
                    );
                }
            );
        }
    }



    private registerDebugState():
        () => void
    {
        return this.ctx.debug
            .setStateProvider(
                () => ({
                    ready:
                        this.ready,

                    scene:
                        "game",

                    player: {
                        alive:
                            !this.gameOver,

                        x:
                            this.player.x,

                        y:
                            this.player.y
                    },

                    score:
                        this.ctx.score.get(),

                    entities: {
                        obstacle:
                            this.countHazardsByRole(
                                "obstacle"
                            ),

                        enemy:
                            this.countHazardsByRole(
                                ENEMY_ROLE
                            ),

                        collectible:
                            this.collectibles
                                ?.getChildren()
                                .length ??
                            0
                    },

                    game_over:
                        this.gameOver
                })
            );
    }

    private createScoreHud():
        void
    {
        let scoreTextX =
            24;

        if (
            this.assets.has(
                SCORE_ICON_ROLE
            )
        ) {
            this.scoreIcon =
                this.add.image(
                    24,
                    38,

                    this.assets.getTextureKey(
                        SCORE_ICON_ROLE
                    )
                );

            this.fitImageToBox(
                this.scoreIcon,
                32,
                32
            );

            this.scoreIcon
                .setOrigin(
                    0,
                    0.5
                )
                .setDepth(
                    1000
                );

            scoreTextX =
                68;
        }

        this.scoreText =
            this.add.text(
                scoreTextX,
                24,

                "Score: 0",

                {
                    fontSize:
                        "28px",

                    color:
                        "#ffffff"
                }
            );

        this.scoreText.setDepth(
            1000
        );
    }

    private registerScoreEvents():
        () => void
    {
        return this.ctx.events
            .on<ScoreChangedEvent>(
                "score.changed",

                ({ value }) => {
                    this.scoreText
                        .setText(
                            `Score: ${value}`
                        );
                }
            );
    }

    private createObstacleTimer():
        void
    {
        this.time.addEvent({
            delay:
                this.spec.runner
                    .obstacle_spawn_interval_ms,

            callback: () => {
                this.spawnObstacle();
            },

            loop:
                true
        });
    }

    private createCollectibleTimer():
        void
    {
        if (
            !this.collectibles
        ) {
            return;
        }

        this.time.addEvent({
            delay:
                COLLECTIBLE_SPAWN_INTERVAL_MS,

            callback:
                () => {
                    this.spawnCollectible();
                },

            loop:
                true
        });
    }

    private updateReadyState():
        void
    {
        if (this.ready) {
            return;
        }

        const body =
            this.player.body;

        if (!body) {
            return;
        }

        if (
            body.blocked.down ||
            body.touching.down
        ) {
            this.ready = true;
        }
    }

    private handleJumpAction():
        void
    {
        if (this.gameOver) {
            this.scene.restart();
            return;
        }

        if (!this.ready) {
            return;
        }

        const body =
            this.player.body as
                Phaser.Physics.Arcade.Body | null;

        if (!body) {
            return;
        }

        const grounded =
            body.blocked.down ||
            body.touching.down;

        if (!grounded) {
            return;
        }

        body.setVelocityY(
            -this.spec.player
                .movement.jump_force
        );
    }

    private spawnObstacle():
        void
    {
        if (
            this.gameOver
        ) {
            return;
        }

        this.hazardSpawnCount +=
            1;

        /*
        * If the template has an enemy asset, every third
        * hazard becomes an NPC enemy instead of the normal
        * obstacle.
        *
        * This keeps the existing spawn interval and avoids
        * creating two independent hazard timelines.
        */
        const spawnEnemy =
            this.assets.has(
                ENEMY_ROLE
            ) &&
            this.hazardSpawnCount %
                ENEMY_SPAWN_EVERY ===
                0;

        const assetRole =
            spawnEnemy
                ? ENEMY_ROLE
                : "obstacle";

        const obstacle =
            this.physics.add.image(
                this.scale.width +
                    50,

                0,

                this.assets.getTextureKey(
                    assetRole
                )
            );

        if (
            spawnEnemy
        ) {
            this.fitImageToBox(
                obstacle,
                56,
                64
            );
        } else {
            this.fitImageToBox(
                obstacle,
                52,
                64
            );
        }

        obstacle.setPosition(
            this.scale.width +
                50,

            this.groundTop -
                obstacle.displayHeight /
                    2
        );

        obstacle
            .setImmovable(
                true
            )
            .setVelocityX(
                -this.currentWorldSpeed
            );

        const body =
            this.configureBody(
                obstacle,

                spawnEnemy
                    ? 0.68
                    : 0.78,

                spawnEnemy
                    ? 0.88
                    : 0.82
            );

        body.setAllowGravity(
            false
        );

        /*
        * Enemy and normal obstacle deliberately share the
        * same hazard group.
        *
        * Existing collision/game-over handling therefore
        * works without a second physics system.
        */
        obstacle.setData(
            "hazardRole",
            assetRole
        );

        this.obstacles.add(
            obstacle
        );
    }

    private spawnCollectible():
        void
    {
        if (
            this.gameOver ||
            !this.collectibles
        ) {
            return;
        }

        const collectible =
            this.physics.add.image(
                this.scale.width +
                    40,

                0,

                this.assets.getTextureKey(
                    COLLECTIBLE_ROLE
                )
            );

        this.fitImageToBox(
            collectible,
            36,
            36
        );

        const minimumY =
            Math.max(
                48,
                this.groundTop -
                    150
            );

        const maximumY =
            Math.max(
                minimumY,
                this.groundTop -
                    70
            );

        const y =
            Phaser.Math.Between(
                Math.round(
                    minimumY
                ),

                Math.round(
                    maximumY
                )
            );

        collectible.setPosition(
            this.scale.width +
                40,

            y
        );

        collectible
            .setImmovable(
                true
            )
            .setVelocityX(
                -this.currentWorldSpeed
            );

        const body =
            this.configureBody(
                collectible,
                0.75,
                0.75
            );

        body.setAllowGravity(
            false
        );

        this.collectibles.add(
            collectible
        );
    }

    private collectCollectible(
        collectible:
            Phaser.Physics.Arcade.Image
    ): void {
        if (
            !collectible.active ||
            this.gameOver
        ) {
            return;
        }

        collectible.disableBody(
            true,
            true
        );

        this.collectibleBonusScore +=
            COLLECTIBLE_SCORE_BONUS;

        const distanceScore =
            Math.floor(
                this.distance /
                    10
            );

        this.ctx.score.set(
            distanceScore +
            this.collectibleBonusScore
        );
    }

    private handleGameOver():
        void
    {
        if (this.gameOver) {
            return;
        }

        this.gameOver = true;

        this.physics.pause();

        this.add.text(
            this.scale.width / 2,
            this.scale.height / 2,

            "GAME OVER",

            {
                fontSize:
                    "48px",

                color:
                    "#ffffff"
            }
        ).setOrigin(
            0.5
        );

        this.add.text(
            this.scale.width / 2,

            this.scale.height /
                2 +
                60,

            "Press SPACE or click to restart",

            {
                fontSize:
                    "20px",

                color:
                    "#ffffff"
            }
        ).setOrigin(
            0.5
        );

        this.ctx.events.emit(
            "game.over",
            {
                score:
                    this.ctx.score.get()
            }
        );
    }

    private updateRuntimeState(
        delta: number
    ): void {
        this.elapsedTimeMs +=
            delta;

        const elapsedSeconds =
            this.elapsedTimeMs /
            1000;

        this.currentWorldSpeed =
            this.spec.runner
                .world_speed +
            this.spec.runner
                .speed_increase_per_second *
                elapsedSeconds;

        const deltaSeconds =
            delta /
            1000;

        this.distance +=
            this.currentWorldSpeed *
            deltaSeconds;

        const distanceScore =
            Math.floor(
                this.distance /
                10
            );

        this.ctx.score.set(
            distanceScore +
            this.collectibleBonusScore
        );
    }

    private updateGroundTileVisuals(
        delta:
            number
    ): void {
        if (
            this.groundTileVisuals.length ===
            0
        ) {
            return;
        }


        const spritesheet =
            this.assets.getSpriteSheet(
                GROUND_TILES_ROLE
            );


        if (
            !spritesheet
        ) {
            return;
        }


        const frameCount =
            spritesheet.columns *
            spritesheet.rows;


        if (
            frameCount <=
            0
        ) {
            return;
        }


        const tileWidth =
            spritesheet.frameWidth;


        if (
            tileWidth <=
            0
        ) {
            return;
        }


        /*
        * Modulo prevents a huge delta after tab switching
        * from moving the entire ground strip thousands of
        * pixels away in a single frame.
        */
        const stripWidth =
            tileWidth *
            this.groundTileVisuals.length;


        const movement =
            (
                this.currentWorldSpeed *
                (
                    delta /
                    1000
                )
            ) %
            stripWidth;


        for (
            const tile of
            this.groundTileVisuals
        ) {
            tile.x -=
                movement;
        }


        let rightmostX =
            Math.max(
                ...this.groundTileVisuals
                    .map(
                        tile =>
                            tile.x
                    )
            );


        /*
        * Recycle from left to right so multiple tiles that
        * leave the screen during the same frame keep their
        * spatial ordering.
        */
        const offscreen =
            this.groundTileVisuals
                .filter(
                    tile =>
                        tile.x +
                            tileWidth <=
                        0
                )
                .sort(
                    (
                        left,
                        right
                    ) =>
                        left.x -
                        right.x
                );


        for (
            const tile of
            offscreen
        ) {
            tile.x =
                rightmostX +
                tileWidth;


            rightmostX =
                tile.x;


            tile.setFrame(
                this.takeNextGroundFrame(
                    frameCount
                )
            );
        }
    }

    private updateObstacleSpeeds():
        void
    {
        for (
            const child of
            this.obstacles
                .getChildren()
        ) {
            const obstacle =
                child as
                    Phaser.Physics.Arcade.Image;

            obstacle.setVelocityX(
                -this.currentWorldSpeed
            );

            if (
                obstacle.x <
                -100
            ) {
                obstacle.destroy();
            }
        }
    }

    private updateCollectibleSpeeds():
        void
    {
        if (
            !this.collectibles
        ) {
            return;
        }

        for (
            const child of
            this.collectibles
                .getChildren()
        ) {
            const collectible =
                child as
                    Phaser.Physics.Arcade.Image;

            collectible.setVelocityX(
                -this.currentWorldSpeed
            );

            if (
                collectible.x <
                -100
            ) {
                collectible.destroy();
            }
        }
    }

    private countHazardsByRole(
        role:
            string
    ): number {
        let count =
            0;

        for (
            const child of
            this.obstacles
                .getChildren()
        ) {
            const hazard =
                child as
                    Phaser.Physics.Arcade.Image;

            if (
                hazard.active &&
                hazard.getData(
                    "hazardRole"
                ) ===
                    role
            ) {
                count +=
                    1;
            }
        }

        return count;
    }

    private fitImageToBox(
        image:
            Phaser.GameObjects.Image,

        maxWidth:
            number,

        maxHeight:
            number
    ): void {
        const scale =
            Math.min(
                maxWidth /
                    image.width,

                maxHeight /
                    image.height
            );

        image.setScale(
            scale
        );
    }

    private configureBody(
        image:
            Phaser.Physics.Arcade.Image,

        widthRatio:
            number,

        heightRatio:
            number
    ): Phaser.Physics.Arcade.Body {
        const body =
            image.body as
                Phaser.Physics.Arcade.Body |
                null;

        if (!body) {
            throw new Error(
                "Arcade physics body was not created"
            );
        }

        /*
        * Body.setSize uses source pixels.
        *
        * GameObject scale is then applied
        * to the body as well.
        */
        body.setSize(
            image.width *
                widthRatio,

            image.height *
                heightRatio,

            true
        );

        return body;
    }
}
