import { ClassDeclaration, ConstructorDeclaration, FieldDeclaration, MethodDeclaration } from "../ast-nodes.js";
import {
  attachToOwner,
  cloneClassDeclaration,
  cloneConstructorDeclaration,
  cloneFieldDeclaration,
  cloneMethodDeclaration,
  createUniqueName,
  signatureForConstructor,
  signatureForMethod,
  typeRefToString,
  type TypeImportMemberPlan,
  type TypeImportPlan,
  type TypeImportStrategy,
  type TypeBrowserLike,
  TypeBrowserError,
} from "./shared.js";

export class ImportTypeWizard {
  constructor(
    private readonly browser: TypeBrowserLike,
    private readonly importedType: ClassDeclaration,
  ) {}

  plan(strategy: TypeImportStrategy = {}): TypeImportPlan {
    const typeConflict = this.browser.resolveType(this.importedType.name);
    const typeAction = strategy.onTypeConflict ?? "merge";
    const memberAction = strategy.onMemberConflict ?? "rename";
    if (!typeConflict || !(typeConflict instanceof ClassDeclaration)) {
      return {
        importedTypeName: this.importedType.name,
        targetTypeName: this.importedType.name,
        action: "add-type",
        memberPlans: this.buildAddPlans(this.importedType),
        warnings: [],
      };
    }
    if (typeAction === "replace") {
      return {
        importedTypeName: this.importedType.name,
        targetTypeName: this.importedType.name,
        action: "replace-type",
        memberPlans: this.buildAddPlans(this.importedType),
        warnings: [`replacing existing type \"${this.importedType.name}\"`],
      };
    }
    if (typeAction === "rename") {
      const renamed = createUniqueName(this.importedType.name, this.browser.allTypes(true).map((type) => type.name));
      return {
        importedTypeName: this.importedType.name,
        targetTypeName: renamed,
        action: "rename-type",
        memberPlans: this.buildAddPlans(this.importedType),
        warnings: [`renaming imported type to \"${renamed}\"`],
      };
    }
    return {
      importedTypeName: this.importedType.name,
      targetTypeName: typeConflict.name,
      action: "merge-type",
      memberPlans: this.buildMergePlans(typeConflict, memberAction),
      warnings: [],
    };
  }

  apply(strategy: TypeImportStrategy = {}): ClassDeclaration {
    const plan = this.plan(strategy);
    switch (plan.action) {
      case "add-type":
      case "rename-type": {
        const cloned = cloneClassDeclaration(this.importedType, plan.targetTypeName);
        this.browser.registerType(cloned);
        return cloned;
      }
      case "replace-type": {
        this.browser.unregisterType(plan.targetTypeName);
        const cloned = cloneClassDeclaration(this.importedType, plan.targetTypeName);
        this.browser.registerType(cloned);
        return cloned;
      }
      case "merge-type": {
        const targetType = this.browser.resolveType(plan.targetTypeName);
        if (!(targetType instanceof ClassDeclaration)) {
          throw new TypeBrowserError(`cannot merge into non-user type \"${plan.targetTypeName}\"`);
        }
        this.applyMergePlan(targetType, plan);
        return targetType;
      }
    }
  }

  private buildAddPlans(type: ClassDeclaration): TypeImportMemberPlan[] {
    return [
      ...type.constructors.map((ctor) => ({ kind: "constructor" as const, action: "add" as const, sourceName: signatureForConstructor(ctor), targetName: signatureForConstructor(ctor), conflictWith: null })),
      ...type.fields.map((field) => ({ kind: "field" as const, action: "add" as const, sourceName: field.name, targetName: field.name, conflictWith: null })),
      ...type.methods.map((method) => ({ kind: "method" as const, action: "add" as const, sourceName: signatureForMethod(method), targetName: signatureForMethod(method), conflictWith: null })),
    ];
  }

  private buildMergePlans(targetType: ClassDeclaration, onConflict: "rename" | "skip" | "replace"): TypeImportMemberPlan[] {
    const memberPlans: TypeImportMemberPlan[] = [];
    const fieldNames = new Set(targetType.fields.map((field) => field.name));
    for (const field of this.importedType.fields) {
      const existing = targetType.fields.find((candidate) => candidate.name === field.name) ?? null;
      memberPlans.push({
        kind: "field",
        action: existing ? (onConflict === "rename" ? "rename" : onConflict) : "add",
        sourceName: field.name,
        targetName: existing && onConflict === "rename" ? createUniqueName(field.name, fieldNames) : field.name,
        conflictWith: existing?.name ?? null,
      });
      fieldNames.add(memberPlans[memberPlans.length - 1].targetName);
    }

    for (const method of this.importedType.methods) {
      const signature = signatureForMethod(method);
      const existing = targetType.methods.find((candidate) => signatureForMethod(candidate) === signature) ?? null;
      const renamed = existing && onConflict === "rename"
        ? `${createUniqueName(method.name, targetType.methods.map((candidate) => candidate.name))}(${method.parameters.map((parameter) => typeRefToString(parameter.paramType)).join(",")})`
        : signature;
      memberPlans.push({
        kind: "method",
        action: existing ? (onConflict === "rename" ? "rename" : onConflict) : "add",
        sourceName: signature,
        targetName: renamed,
        conflictWith: existing ? signature : null,
      });
    }

    for (const ctor of this.importedType.constructors) {
      const signature = signatureForConstructor(ctor);
      const existing = targetType.constructors.find((candidate) => signatureForConstructor(candidate) === signature) ?? null;
      memberPlans.push({
        kind: "constructor",
        action: existing ? onConflict : "add",
        sourceName: signature,
        targetName: signature,
        conflictWith: existing ? signature : null,
      });
    }
    return memberPlans;
  }

  private applyMergePlan(targetType: ClassDeclaration, plan: TypeImportPlan): void {
    for (const memberPlan of plan.memberPlans) {
      if (memberPlan.action === "skip") continue;
      if (memberPlan.kind === "field") {
        const source = this.importedType.fields.find((field) => field.name === memberPlan.sourceName);
        if (!source) continue;
        const clone = cloneFieldDeclaration(source);
        clone.name = memberPlan.targetName;
        this.applyFieldPlan(targetType, clone, memberPlan);
        continue;
      }
      if (memberPlan.kind === "method") {
        const source = this.importedType.methods.find((method) => signatureForMethod(method) === memberPlan.sourceName);
        if (!source) continue;
        const clone = cloneMethodDeclaration(source);
        if (memberPlan.action === "rename") {
          clone.name = memberPlan.targetName.slice(0, memberPlan.targetName.indexOf("("));
        }
        this.applyMethodPlan(targetType, clone, memberPlan);
        continue;
      }
      const source = this.importedType.constructors.find((ctor) => signatureForConstructor(ctor) === memberPlan.sourceName);
      if (!source) continue;
      const clone = cloneConstructorDeclaration(source);
      this.applyConstructorPlan(targetType, clone, memberPlan);
    }
  }

  private applyFieldPlan(targetType: ClassDeclaration, field: FieldDeclaration, plan: TypeImportMemberPlan): void {
    const existingIndex = targetType.fields.findIndex((candidate) => candidate.name === plan.conflictWith);
    if (plan.action === "replace" && existingIndex >= 0) {
      attachToOwner(targetType, field);
      targetType.fields.splice(existingIndex, 1, field);
      return;
    }
    attachToOwner(targetType, field);
    targetType.fields.push(field);
  }

  private applyMethodPlan(targetType: ClassDeclaration, method: MethodDeclaration, plan: TypeImportMemberPlan): void {
    const existingIndex = targetType.methods.findIndex((candidate) => signatureForMethod(candidate) === plan.conflictWith);
    if (plan.action === "replace" && existingIndex >= 0) {
      attachToOwner(targetType, method);
      targetType.methods.splice(existingIndex, 1, method);
      return;
    }
    attachToOwner(targetType, method);
    targetType.methods.push(method);
  }

  private applyConstructorPlan(targetType: ClassDeclaration, constructorDeclaration: ConstructorDeclaration, plan: TypeImportMemberPlan): void {
    const existingIndex = targetType.constructors.findIndex((candidate) => signatureForConstructor(candidate) === plan.conflictWith);
    if (plan.action === "replace" && existingIndex >= 0) {
      attachToOwner(targetType, constructorDeclaration);
      targetType.constructors.splice(existingIndex, 1, constructorDeclaration);
      return;
    }
    attachToOwner(targetType, constructorDeclaration);
    targetType.constructors.push(constructorDeclaration);
  }
}
