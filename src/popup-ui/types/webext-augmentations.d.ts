// Firefox ships tabs.group()/tabGroups, but @types/firefox-webext-browser@120
// predates them, so tabs.Tab has no groupId. We read it deliberately when
// reopening a tab in another container, to keep it in its original tab group
// (see src/js/utils.js and assignManager.createTabWrapper).
//
// Interface merging works here because @types/firefox-webext-browser is a
// global script; this file must stay free of top-level imports/exports or it
// becomes a module and the augmentation stops applying.
//
// Delete once the types package catches up.
declare namespace browser.tabs {
  interface Tab {
    /** Tab group the tab belongs to; absent or -1 when ungrouped. */
    groupId?: number;
  }
}
