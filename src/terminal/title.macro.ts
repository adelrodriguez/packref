import figlet from "figlet"

export function getTitle() {
  return figlet.textSync("packref", { font: "Slant" })
}
