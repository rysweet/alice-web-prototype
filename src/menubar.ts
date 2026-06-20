import { listHelpTopics } from "./help-system";
import type { ProjectManager, StandaloneJavaProject } from "./project-manager";
import type { TutorialSystem } from "./tutorial-system";
import type { UndoRedoManager } from "./undo-redo";
import type { Clipboard } from "./clipboard";

export type IdeMenuId = "file" | "edit" | "window" | "help";
export type IdePerspectiveId = "scene-setup" | "code-editor" | "events" | string;

type MaybePromise<T> = T | Promise<T>;

export interface OpenProjectRequest {
  data: ArrayBuffer | Uint8Array;
  fileName: string;
}

export interface MenuBarClipboardActions {
  canCut?: () => boolean;
  canCopy?: () => boolean;
  canPaste?: (clipboard: Clipboard) => boolean;
  cut?: () => MaybePromise<void>;
  copy?: () => MaybePromise<void>;
  paste?: (clipboard: Clipboard) => MaybePromise<void>;
}

export interface MenuBarFileActions {
  requestOpen?: () => MaybePromise<OpenProjectRequest | null>;
  requestSaveAsFileName?: (
    suggestedFileName: string,
  ) => MaybePromise<string | null>;
  consumeSavedProject?: (
    fileName: string,
    data: Uint8Array,
  ) => MaybePromise<void>;
  handleExport?: (project: StandaloneJavaProject) => MaybePromise<void>;
}

export interface MenuBarPerspective {
  id: IdePerspectiveId;
  label: string;
}

export interface AboutDialogModel {
  applicationName: string;
  version: string;
  summary: string;
  helpTopicIds: string[];
}

export interface TutorialDialogModel {
  isComplete: boolean;
  currentStepId: string | null;
  currentInstruction: string | null;
  completedStepIds: string[];
  availableHints: string[];
}

export interface IdeMenuBarModelOptions {
  projectManager: ProjectManager;
  undoRedoManager: UndoRedoManager;
  clipboard: Clipboard;
  fileActions?: MenuBarFileActions;
  clipboardActions?: MenuBarClipboardActions;
  perspectives?: readonly MenuBarPerspective[];
  initialPerspectiveId?: IdePerspectiveId;
  tutorialSystem?: TutorialSystem;
  onAbout?: (about: AboutDialogModel) => MaybePromise<void>;
  onTutorial?: (tutorial: TutorialDialogModel) => MaybePromise<void>;
  about?: Partial<AboutDialogModel>;
  exportPackageName?: string;
}

export interface MenuItemModel {
  id: string;
  label: string;
  enabled: boolean;
  checked: boolean;
  execute(): Promise<void>;
}

export interface MenuModel {
  id: IdeMenuId;
  label: string;
  items: MenuItemModel[];
}

const DEFAULT_PERSPECTIVES: readonly MenuBarPerspective[] = [
  { id: "scene-setup", label: "Scene Setup" },
  { id: "code-editor", label: "Code Editor" },
  { id: "events", label: "Events" },
] as const;

class MutableMenuItemModel implements MenuItemModel {
  enabled = true;
  checked = false;

  constructor(
    public readonly id: string,
    public readonly label: string,
    private readonly action: () => MaybePromise<void>,
    private readonly canExecute: () => boolean = () => true,
    private readonly isChecked: () => boolean = () => false,
  ) {
    this.refresh();
  }

  refresh(): void {
    this.enabled = this.canExecute();
    this.checked = this.isChecked();
  }

  async execute(): Promise<void> {
    this.refresh();
    if (!this.enabled) {
      return;
    }
    await this.action();
    this.refresh();
  }
}

export class IdeMenuBarModel {
  readonly fileMenu: MenuModel;
  readonly editMenu: MenuModel;
  readonly windowMenu: MenuModel;
  readonly helpMenu: MenuModel;
  readonly menus: readonly MenuModel[];

  private readonly projectManager: ProjectManager;
  private readonly undoRedoManager: UndoRedoManager;
  private readonly clipboard: Clipboard;
  private readonly fileActions: MenuBarFileActions;
  private readonly clipboardActions: MenuBarClipboardActions;
  private readonly tutorialSystem?: TutorialSystem;
  private readonly onAbout?: (about: AboutDialogModel) => MaybePromise<void>;
  private readonly onTutorial?: (tutorial: TutorialDialogModel) => MaybePromise<void>;
  private readonly aboutOverrides: Partial<AboutDialogModel>;
  private readonly exportPackageName: string;
  private readonly perspectives: readonly MenuBarPerspective[];
  private readonly itemsById = new Map<string, MutableMenuItemModel>();
  private currentPerspectiveId: IdePerspectiveId;

  constructor(options: IdeMenuBarModelOptions) {
    this.projectManager = options.projectManager;
    this.undoRedoManager = options.undoRedoManager;
    this.clipboard = options.clipboard;
    this.fileActions = options.fileActions ?? {};
    this.clipboardActions = options.clipboardActions ?? {};
    this.tutorialSystem = options.tutorialSystem;
    this.onAbout = options.onAbout;
    this.onTutorial = options.onTutorial;
    this.aboutOverrides = options.about ?? {};
    this.exportPackageName = options.exportPackageName ?? "org.alice.generated";
    this.perspectives = options.perspectives?.length
      ? [...options.perspectives]
      : [...DEFAULT_PERSPECTIVES];
    this.currentPerspectiveId =
      options.initialPerspectiveId ?? this.perspectives[0]?.id ?? "scene-setup";

    this.fileMenu = {
      id: "file",
      label: "File",
      items: [
        this.registerItem("new", "New", async () => {
          this.projectManager.create();
          this.refresh();
        }),
        this.registerItem("open", "Open", async () => {
          const request = await this.fileActions.requestOpen?.();
          if (!request) {
            return;
          }
          await this.projectManager.open(request.data, request.fileName);
          this.refresh();
        }, () => typeof this.fileActions.requestOpen === "function"),
        this.registerItem("save", "Save", async () => {
          if (!this.projectManager.isOpen) {
            return;
          }
          if (!this.projectManager.fileName && this.fileActions.requestSaveAsFileName) {
            await this.saveAs();
            return;
          }
          const data = await this.projectManager.save();
          if (this.projectManager.fileName) {
            await this.fileActions.consumeSavedProject?.(
              this.projectManager.fileName,
              data,
            );
          }
          this.refresh();
        }, () => this.projectManager.isOpen),
        this.registerItem("save-as", "Save As", async () => {
          await this.saveAs();
        }, () => this.projectManager.isOpen && typeof this.fileActions.requestSaveAsFileName === "function"),
        this.registerItem("export", "Export", async () => {
          const exported = this.projectManager.exportToStandaloneJavaProject(
            this.exportPackageName,
          );
          await this.fileActions.handleExport?.(exported);
          this.refresh();
        }, () => this.projectManager.isOpen),
        this.registerItem("close", "Close", async () => {
          this.projectManager.close();
          this.refresh();
        }, () => this.projectManager.isOpen),
      ],
    };

    this.editMenu = {
      id: "edit",
      label: "Edit",
      items: [
        this.registerItem("undo", "Undo", async () => {
          this.undoRedoManager.undo();
          this.refresh();
        }, () => this.undoRedoManager.canUndo),
        this.registerItem("redo", "Redo", async () => {
          this.undoRedoManager.redo();
          this.refresh();
        }, () => this.undoRedoManager.canRedo),
        this.registerItem("cut", "Cut", async () => {
          await this.clipboardActions.cut?.();
          this.refresh();
        }, () => this.clipboardActions.canCut?.() ?? false),
        this.registerItem("copy", "Copy", async () => {
          await this.clipboardActions.copy?.();
          this.refresh();
        }, () => this.clipboardActions.canCopy?.() ?? false),
        this.registerItem("paste", "Paste", async () => {
          await this.clipboardActions.paste?.(this.clipboard);
          this.refresh();
        }, () => this.clipboardActions.canPaste?.(this.clipboard) ?? !this.clipboard.isEmpty),
      ],
    };

    this.windowMenu = {
      id: "window",
      label: "Window",
      items: this.perspectives.map((perspective) => this.registerItem(
        perspective.id,
        perspective.label,
        async () => {
          this.currentPerspectiveId = perspective.id;
          this.refresh();
        },
        () => true,
        () => this.currentPerspectiveId === perspective.id,
      )),
    };

    this.helpMenu = {
      id: "help",
      label: "Help",
      items: [
        this.registerItem("about", "About", async () => {
          await this.onAbout?.(this.getAboutDialog());
        }),
        this.registerItem("tutorial", "Tutorial", async () => {
          const tutorial = this.getTutorialDialog();
          if (!tutorial) {
            return;
          }
          await this.onTutorial?.(tutorial);
        }, () => this.tutorialSystem != null),
      ],
    };

    this.menus = [this.fileMenu, this.editMenu, this.windowMenu, this.helpMenu];
    this.refresh();
  }

  get currentPerspective(): IdePerspectiveId {
    return this.currentPerspectiveId;
  }

  getMenu(menuId: IdeMenuId): MenuModel {
    const menu = this.menus.find((entry) => entry.id === menuId);
    if (!menu) {
      throw new Error(`Unknown menu: ${menuId}`);
    }
    return menu;
  }

  getMenuItem(itemId: string): MenuItemModel {
    const item = this.itemsById.get(itemId);
    if (!item) {
      throw new Error(`Unknown menu item: ${itemId}`);
    }
    return item;
  }

  refresh(): void {
    for (const item of this.itemsById.values()) {
      item.refresh();
    }
  }

  getAboutDialog(): AboutDialogModel {
    return {
      applicationName:
        this.aboutOverrides.applicationName ?? "LookingGlass",
      version: this.aboutOverrides.version ?? "0.10.0",
      summary:
        this.aboutOverrides.summary
        ?? "Prototype menu bar model for file, edit, window, and help actions.",
      helpTopicIds:
        this.aboutOverrides.helpTopicIds
        ?? listHelpTopics().map((topic) => topic.id),
    };
  }

  getTutorialDialog(): TutorialDialogModel | null {
    if (!this.tutorialSystem) {
      return null;
    }
    const progress = this.tutorialSystem.progress;
    return {
      isComplete: progress.isComplete,
      currentStepId: progress.currentStep?.id ?? null,
      currentInstruction: progress.currentStep?.instructionText ?? null,
      completedStepIds: [...progress.completedStepIds],
      availableHints: this.tutorialSystem.getAvailableHints(),
    };
  }

  private registerItem(
    id: string,
    label: string,
    action: () => MaybePromise<void>,
    canExecute?: () => boolean,
    isChecked?: () => boolean,
  ): MutableMenuItemModel {
    const item = new MutableMenuItemModel(id, label, action, canExecute, isChecked);
    this.itemsById.set(id, item);
    return item;
  }

  private async saveAs(): Promise<void> {
    if (!this.projectManager.isOpen || !this.fileActions.requestSaveAsFileName) {
      return;
    }
    const suggestedFileName = this.projectManager.fileName ?? "untitled.a3p";
    const fileName = await this.fileActions.requestSaveAsFileName(suggestedFileName);
    if (!fileName) {
      return;
    }
    const data = await this.projectManager.saveAs(fileName);
    await this.fileActions.consumeSavedProject?.(fileName, data);
    this.refresh();
  }
}
