export type Mutable<Value> = {
  -readonly [Key in keyof Value]: Value[Key]
}
