import { makeMerchIdeasWhatsAppUrl } from "./whatsapp";

describe("makeMerchIdeasWhatsAppUrl", () => {
  test("formats local South African mobile numbers", () => {
    expect(makeMerchIdeasWhatsAppUrl("082 123 4567")).toMatch(
      /^https:\/\/wa\.me\/27821234567\?text=/
    );
  });

  test("accepts international numbers", () => {
    expect(makeMerchIdeasWhatsAppUrl("+27 82 123 4567")).toContain(
      "wa.me/27821234567"
    );
    expect(makeMerchIdeasWhatsAppUrl("0027821234567")).toContain(
      "wa.me/27821234567"
    );
  });

  test("does not offer a link for missing or invalid support numbers", () => {
    expect(makeMerchIdeasWhatsAppUrl("")).toBeNull();
    expect(makeMerchIdeasWhatsAppUrl("123")).toBeNull();
    expect(makeMerchIdeasWhatsAppUrl("000")).toBeNull();
  });

  test("keeps configured international number for other countries", () => {
    expect(makeMerchIdeasWhatsAppUrl("+447911123456", "GB")).toContain(
      "wa.me/447911123456"
    );
  });

  test("prepopulates the merch enquiry", () => {
    const url = makeMerchIdeasWhatsAppUrl("0821234567");
    expect(decodeURIComponent(url.split("?text=")[1])).toContain("merch idea");
  });
});
