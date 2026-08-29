import Phaser from "phaser";
import type { GameSpec } from "@game-factory/game-spec";
import type {
    GameContext,
    ScoreChangedEvent
} from "@game-factory/runtime";
import {
    PhaserInputService
} from "../input/PhaserInputService.js";

export class GameScene extends Phaser.Scene {
    constructor(
        private readonly spec: GameSpec,
        private readonly ctx: GameContext,
        private readonly inputAdapter: PhaserInputService
    ) {
        super("game");
    }

    //Runtime State
    private gameOver = false;

    private elapsedTimeMs = 0;
    private currentWorldSpeed = 0;
    private distance = 0;

    private scoreText!: Phaser.GameObjects.Text;

    //GameSpec
    private ground!: Phaser.GameObjects.Rectangle;
    private player!: Phaser.GameObjects.Rectangle;
    private obstacles!: Phaser.GameObjects.Group;

    create(): void {
        this.inputAdapter.attach(this);

        this.gameOver = false;

        this.elapsedTimeMs = 0;
        this.currentWorldSpeed =
            this.spec.runner.world_speed;

        this.distance = 0;

        const width = this.scale.width;
        const height = this.scale.height;

        const groundHeight = 120;
        

        this.ground = this.add.rectangle(
            width / 2,
            height - groundHeight / 2,
            width,
            groundHeight,
            0x555555
        );

        this.physics.add.existing(
            this.ground,
            true
        );

        this.player = this.add.rectangle(
            200,
            height - groundHeight - 40,
            60,
            80,
            0xffffff
        );

        this.obstacles = this.add.group();

        this.physics.add.collider(
            this.player,
            this.obstacles,
            () => {
                this.handleGameOver();
            }
        );

        this.physics.add.existing(this.player);

        this.physics.add.collider(
            this.player,
            this.ground
        );

        const unregisterDebugState =
            this.ctx.debug.setStateProvider(() => ({
                ready: true,

                scene: "game",

                player: {
                    alive: !this.gameOver,
                    x: this.player.x,
                    y: this.player.y
                },

                score: this.ctx.score.get(),

                entities: {
                    obstacle:
                        this.obstacles.getChildren().length
                },

                game_over: this.gameOver
            }));

        this.scoreText = this.add.text(
            24,
            24,
            "Score: 0",
            {
                fontSize: "28px",
                color: "#ffffff"
            }
        );

        const unsubscribeScore =
            this.ctx.events.on<ScoreChangedEvent>(
                "score.changed",
                ({ value }) => {
                    this.scoreText.setText(
                        `Score: ${value}`
                    );
                }
            );
        
        this.events.once(
            Phaser.Scenes.Events.SHUTDOWN,
            () => {
                unsubscribeScore();
                unregisterDebugState();

                this.inputAdapter.detach();
            }
        );

        this.ctx.score.reset();


        this.time.addEvent({
            delay:
                this.spec.runner.obstacle_spawn_interval_ms,

            callback: () => {
                this.spawnObstacle();
            },

            loop: true
        });
    }

    update(_time: number, delta: number): void {

        if (
            this.ctx.input.justPressed("jump")
        ) {
            this.handleJumpAction();
        }

        if (this.gameOver) {
            return;
        }

        this.updateRuntimeState(delta);
        this.updateObstacleSpeeds();
        this.cleanupObstacles();
    }

    private handleJumpAction(): void {
        if (this.gameOver) {
            this.scene.restart();
            return;
        }

        const body =
            this.player.body as Phaser.Physics.Arcade.Body;

        if (!body.blocked.down) {
            return;
        }

        body.setVelocityY(
            -this.spec.player.movement.jump_force
        );
    }

    private spawnObstacle(): void {
        if (this.gameOver) {
            return;
        }

        const width = this.scale.width;
        const height = this.scale.height;

        const groundHeight = 120;

        const obstacleWidth = 50;
        const obstacleHeight = 70;

        const obstacle = this.add.rectangle(
            width + obstacleWidth,
            height - groundHeight - obstacleHeight / 2,
            obstacleWidth,
            obstacleHeight,
            0xff5555
        );

        this.physics.add.existing(obstacle);

        const body =
            obstacle.body as Phaser.Physics.Arcade.Body;

        body.setAllowGravity(false);
        body.setImmovable(true);

        body.setVelocityX(
            -this.currentWorldSpeed
        );

        this.obstacles.add(obstacle);
    }

    private handleGameOver(): void {
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
                fontSize: "48px",
                color: "#ffffff"
            }
        ).setOrigin(0.5);

        this.add.text(
            this.scale.width / 2,
            this.scale.height / 2 + 60,
            "Press SPACE or click to restart",
            {
                fontSize: "20px",
                color: "#ffffff"
            }
        ).setOrigin(0.5);

        this.ctx.events.emit(
            "game.over",
            {
                score: this.ctx.score.get()
            }
        );
    }

    private cleanupObstacles(): void {
        for (const child of this.obstacles.getChildren()) {
            const obstacle =
                child as Phaser.GameObjects.Rectangle;

            if (obstacle.x < -obstacle.width) {
                obstacle.destroy();
            }
        }
    }

    private updateRuntimeState(
        delta: number
    ): void {
        this.elapsedTimeMs += delta;

        const elapsedSeconds =
            this.elapsedTimeMs / 1000;

        this.currentWorldSpeed =
            this.spec.runner.world_speed +
            this.spec.runner.speed_increase_per_second *
                elapsedSeconds;

        const deltaSeconds = delta / 1000;

        this.distance +=
            this.currentWorldSpeed * deltaSeconds;

        const score = Math.floor(
            this.distance / 10
        );

        this.ctx.score.set(score);
    }

    private updateObstacleSpeeds(): void {
        for (
            const child of
            this.obstacles.getChildren()
        ) {
            const obstacle =
                child as Phaser.GameObjects.Rectangle;

            const body =
                obstacle.body as Phaser.Physics.Arcade.Body;

            body.setVelocityX(
                -this.currentWorldSpeed
            );
        }
    }
}

