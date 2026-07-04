import { describe, it, expect } from "vitest";
import { createFolderMapper, type Folder } from "../email-adapter.js";

describe("createFolderMapper", () => {
  const mapFolder = createFolderMapper({
    INBOX: "inbox-value",
    SENT: "sent-value",
    DRAFTS: "drafts-value",
    TRASH: "trash-value",
    SPAM: "spam-value",
  });

  it("maps each canonical folder to its provider-specific value", () => {
    expect(mapFolder("INBOX")).toBe("inbox-value");
    expect(mapFolder("SENT")).toBe("sent-value");
    expect(mapFolder("DRAFTS")).toBe("drafts-value");
    expect(mapFolder("TRASH")).toBe("trash-value");
    expect(mapFolder("SPAM")).toBe("spam-value");
  });

  it("throws a consistent error message for an unmapped folder", () => {
    expect(() => mapFolder("ARCHIVE" as Folder)).toThrow(
      "unknown folder: ARCHIVE. Valid: INBOX, SENT, DRAFTS, TRASH, SPAM.",
    );
  });
});
