import {
    describe,
    expect,
    it
} from "vitest";

import {
    loadGameFactoryConfig
} from "../src/index.js";

describe(
    "loadGameFactoryConfig",
    () => {
        it(
            "disables SpriteVault by default",
            () => {
                const config =
                    loadGameFactoryConfig({
                        env: {}
                    });

                expect(
                    config.spriteVault.mode
                ).toBe(
                    "disabled"
                );

                expect(
                    config.spriteVault.minimumScore
                ).toBe(
                    0.5
                );

                expect(
                    config.spriteVault.timeoutMs
                ).toBe(
                    10_000
                );

                expect(
                    config.ai.provider
                ).toBe(
                    "disabled"
                );

                expect(
                    config.ai.timeoutMs
                ).toBe(
                    60_000
                );
            }
        );

        it(
            "loads HTTP SpriteVault configuration",
            () => {
                const config =
                    loadGameFactoryConfig({
                        env: {
                            GAME_FACTORY_SPRITEVAULT_MODE:
                                "http",

                            GAME_FACTORY_SPRITEVAULT_URL:
                                "http://localhost:3001",

                            GAME_FACTORY_SPRITEVAULT_SEARCH_PATH:
                                "/assets/search",

                            GAME_FACTORY_SPRITEVAULT_API_KEY:
                                "test-key",

                            GAME_FACTORY_SPRITEVAULT_MIN_SCORE:
                                "0.75",

                            GAME_FACTORY_SPRITEVAULT_TIMEOUT_MS:
                                "5000"
                        }
                    });

                expect(
                    config.spriteVault
                ).toMatchObject({
                    mode:
                        "http",

                    baseUrl:
                        "http://localhost:3001",

                    searchPath:
                        "/assets/search",

                    apiKey:
                        "test-key",

                    minimumScore:
                        0.75,

                    timeoutMs:
                        5000
                });
            }
        );

        it(
            "loads local SpriteVault configuration",
            () => {
                const config =
                    loadGameFactoryConfig({
                        env: {
                            GAME_FACTORY_SPRITEVAULT_MODE:
                                "local",

                            GAME_FACTORY_SPRITEVAULT_DB_PATH:
                                "D:\\SpriteVault\\catalog.sqlite",

                            GAME_FACTORY_SPRITEVAULT_ROOT_PATH:
                                "D:\\SpriteVault"
                        }
                    });

                expect(
                    config.spriteVault.mode
                ).toBe(
                    "local"
                );

                expect(
                    config.spriteVault.databasePath
                ).toBe(
                    "D:\\SpriteVault\\catalog.sqlite"
                );

                expect(
                    config.spriteVault.rootPath
                ).toBe(
                    "D:\\SpriteVault"
                );

                expect(
                    config.spriteVault.minimumScore
                ).toBe(
                    0.5
                );
            }
        );

        it(
            "rejects HTTP SpriteVault without URL",
            () => {
                expect(
                    () =>
                        loadGameFactoryConfig({
                            env: {
                                GAME_FACTORY_SPRITEVAULT_MODE:
                                    "http",

                                GAME_FACTORY_SPRITEVAULT_SEARCH_PATH:
                                    "/assets/search"
                            }
                        })
                ).toThrow(
                    /GAME_FACTORY_SPRITEVAULT_URL/
                );
            }
        );

        it(
            "requires database path for local SpriteVault",
            () => {
                expect(
                    () =>
                        loadGameFactoryConfig({
                            env: {
                                GAME_FACTORY_SPRITEVAULT_MODE:
                                    "local",

                                GAME_FACTORY_SPRITEVAULT_ROOT_PATH:
                                    "D:\\SpriteVault"
                            }
                        })
                ).toThrow(
                    /GAME_FACTORY_SPRITEVAULT_DB_PATH/
                );
            }
        );

        it(
            "loads OpenRouter AI configuration",
            () => {
                const config =
                    loadGameFactoryConfig({
                        env: {
                            GAME_FACTORY_AI_PROVIDER:
                                "openrouter",

                            GAME_FACTORY_AI_MODEL:
                                "some/provider-model",

                            GAME_FACTORY_AI_API_KEY:
                                "secret",

                            GAME_FACTORY_AI_TIMEOUT_MS:
                                "45000",

                            GAME_FACTORY_AI_SITE_URL:
                                "https://game-factory.local",

                            GAME_FACTORY_AI_APP_NAME:
                                "Game Factory"
                        }
                    });

                expect(
                    config.ai
                ).toMatchObject({
                    provider:
                        "openrouter",

                    model:
                        "some/provider-model",

                    apiKey:
                        "secret",

                    timeoutMs:
                        45_000,

                    siteUrl:
                        "https://game-factory.local",

                    appName:
                        "Game Factory"
                });
            }
        );

        it(
            "loads OpenAI-compatible AI configuration",
            () => {
                const config =
                    loadGameFactoryConfig({
                        env: {
                            GAME_FACTORY_AI_PROVIDER:
                                "openai-compatible",

                            GAME_FACTORY_AI_MODEL:
                                "local-model",

                            GAME_FACTORY_AI_BASE_URL:
                                "http://127.0.0.1:1234/v1/"
                        }
                    });

                expect(
                    config.ai.provider
                ).toBe(
                    "openai-compatible"
                );

                expect(
                    config.ai.model
                ).toBe(
                    "local-model"
                );

                expect(
                    config.ai.baseUrl
                ).toBe(
                    "http://127.0.0.1:1234/v1/"
                );
            }
        );

        it(
            "requires API key for OpenRouter",
            () => {
                expect(
                    () =>
                        loadGameFactoryConfig({
                            env: {
                                GAME_FACTORY_AI_PROVIDER:
                                    "openrouter",

                                GAME_FACTORY_AI_MODEL:
                                    "test/model"
                            }
                        })
                ).toThrow(
                    /GAME_FACTORY_AI_API_KEY/
                );
            }
        );
    }
);