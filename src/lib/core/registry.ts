export const SUPPORTED_REGISTRIES = ["npm"] as const

export type Registry = (typeof SUPPORTED_REGISTRIES)[number]

export const DEFAULT_REGISTRY: Registry = "npm"

export const checkIsRegistry = (value: string): value is Registry =>
  SUPPORTED_REGISTRIES.includes(value as Registry)
