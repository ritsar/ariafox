import { t } from "../shared/messages.js";

const MENU_LINK = "ariafox-link";
const MENU_SELECTION = "ariafox-selection";
const MENU_MEDIA = "ariafox-media";
const MENU_PAGE = "ariafox-page";

type SendHandler = (urls: string[], referrer?: string) => Promise<void>;

export function createContextMenus(): void {
  const menus = browser.menus;
  if (!menus) return;
  void menus.removeAll().then(() => {
    menus.create({
      id: MENU_LINK,
      title: t("menuSendLink"),
      contexts: ["link"],
    });
    menus.create({
      id: MENU_SELECTION,
      title: t("menuSendSelection"),
      contexts: ["selection"],
    });
    menus.create({
      id: MENU_MEDIA,
      title: t("menuSendMedia"),
      contexts: ["image", "video", "audio"],
    });
    menus.create({
      id: MENU_PAGE,
      title: t("menuSendPage"),
      contexts: ["page"],
    });
  });
}

export function registerMenuClickHandler(send: SendHandler): void {
  browser.menus?.onClicked.addListener((info, tab) => {
    const referrer = info.pageUrl ?? tab?.url;
    const urls: string[] = [];
    if (info.menuItemId === MENU_LINK && info.linkUrl) urls.push(info.linkUrl);
    if (info.menuItemId === MENU_SELECTION && info.selectionText) {
      urls.push(
        ...info.selectionText
          .split(/\s+/)
          .map((part) => part.trim())
          .filter((part) => /^https?:\/\//i.test(part) || part.startsWith("magnet:")),
      );
    }
    if (info.menuItemId === MENU_MEDIA && info.srcUrl) urls.push(info.srcUrl);
    if (info.menuItemId === MENU_PAGE && info.pageUrl) urls.push(info.pageUrl);
    if (urls.length === 0) return;
    void send(urls, referrer);
  });
}
