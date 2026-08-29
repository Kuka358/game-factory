export interface Workspace {
    root: string;

    specFile: string;
    templateFile: string;
    engineFile: string;

    projectDir: string;
    buildDir: string;
    qaDir: string;
    artifactsDir: string;
    assetsDir: string;
    assetManifestFile: string;
}