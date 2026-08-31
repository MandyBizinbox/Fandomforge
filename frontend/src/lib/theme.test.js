import { applyPlatformTheme, normaliseTheme } from "./theme";

describe("platform theme", () => {
  test("derives readable light-theme primitives from a light background", () => {
    const theme = normaliseTheme({
      theme_mode: "light",
      background_color: "#ffffff",
      primary_color: "#123456",
    });

    expect(theme.backgroundTone).toBe("light");
    expect(theme.pageText).toBe("#111111");
    expect(theme.cardBg).toBe("#FFFFFF");
    expect(theme.inputText).toBe("#111111");
    expect(theme.primary).toBe("#123456");
  });

  test("derives readable dark-theme primitives from a dark background", () => {
    const theme = normaliseTheme({
      theme_mode: "dark",
      background_color: "#0a0a0a",
    });

    expect(theme.backgroundTone).toBe("dark");
    expect(theme.pageText).toBe("#FFFFFF");
    expect(theme.cardBg).toBe("#161616");
    expect(theme.inputBg).toBe("#0f0f0f");
    expect(theme.inputText).toBe("#FFFFFF");
  });

  test("honours explicit Platform Settings overrides", () => {
    const theme = normaliseTheme({
      theme_mode: "dark",
      background_color: "#111111",
      page_text_color: "#eeeeee",
      card_background_color: "#202020",
      card_text_color: "#fefefe",
      input_background_color: "#303030",
      input_text_color: "#fafafa",
      button_primary_background_color: "#445566",
      button_primary_text_color: "#ffffff",
    });

    expect(theme.pageText).toBe("#eeeeee");
    expect(theme.cardBg).toBe("#202020");
    expect(theme.cardText).toBe("#fefefe");
    expect(theme.inputBg).toBe("#303030");
    expect(theme.inputText).toBe("#fafafa");
    expect(theme.primaryButtonBg).toBe("#445566");
  });

  test("publishes semantic CSS variables on the document root", () => {
    applyPlatformTheme({
      theme_mode: "dark",
      background_color: "#101010",
      primary_color: "#abcdef",
      card_background_color: "#181818",
      input_background_color: "#222222",
    });

    const root = document.documentElement;
    expect(root.style.getPropertyValue("--ff-primary")).toBe("#abcdef");
    expect(root.style.getPropertyValue("--ff-page-bg")).toBe("#101010");
    expect(root.style.getPropertyValue("--ff-card-bg")).toBe("#181818");
    expect(root.style.getPropertyValue("--ff-input-bg")).toBe("#222222");
    expect(root.dataset.themeMode).toBe("dark");
  });
});
