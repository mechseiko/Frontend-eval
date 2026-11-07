/** @jest-environment jsdom */
import { useState } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Dialog } from "../src/solution";

function Harness({ children, onClose = () => {}, title = "Settings", startOpen = false, label = "Open" }) {
  const [open, setOpen] = useState(startOpen);
  return (
    <div>
      <button onClick={() => setOpen(true)}>{label}</button>
      <Dialog open={open} onClose={() => { onClose(); setOpen(false); }} title={title}>
        {children}
      </Dialog>
    </div>
  );
}

const body = (
  <>
    <input aria-label="name" />
    <button>Save</button>
    <a href="#x">Help</a>
  </>
);

afterEach(() => { document.body.style.overflow = ""; });

describe("Dialog", () => {
  test("[aria] closed renders nothing", () => {
    render(<Dialog open={false} onClose={() => {}} title="T">x</Dialog>);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByTestId("backdrop")).toBeNull();
  });

  test("[aria] role, aria-modal and aria-labelledby", () => {
    render(<Dialog open onClose={() => {}} title="Settings">{body}</Dialog>);
    const dlg = screen.getByRole("dialog", { name: "Settings" });
    expect(dlg).toHaveAttribute("aria-modal", "true");
    const labelId = dlg.getAttribute("aria-labelledby");
    expect(document.getElementById(labelId)).toHaveTextContent("Settings");
    expect(dlg).toHaveAttribute("tabindex", "-1");
    expect(screen.getByTestId("backdrop")).toContainElement(dlg);
  });

  test("[aria] two dialogs get different label ids", () => {
    render(<><Dialog open onClose={() => {}} title="A">a</Dialog><Dialog open onClose={() => {}} title="B">b</Dialog></>);
    const [d1, d2] = screen.getAllByRole("dialog");
    expect(d1.getAttribute("aria-labelledby")).not.toBe(d2.getAttribute("aria-labelledby"));
  });

  test("[initial-focus] focuses the first focusable element", () => {
    render(<Dialog open onClose={() => {}} title="T">{body}</Dialog>);
    expect(screen.getByLabelText("name")).toHaveFocus();
  });

  test("[initial-focus] data-autofocus wins", () => {
    render(<Dialog open onClose={() => {}} title="T"><input aria-label="first" /><button data-autofocus>Go</button></Dialog>);
    expect(screen.getByRole("button", { name: "Go" })).toHaveFocus();
  });

  test("[initial-focus] {L2} focuses the dialog itself when nothing is focusable", () => {
    render(<Dialog open onClose={() => {}} title="T"><p>Read only</p><button disabled>No</button></Dialog>);
    expect(screen.getByRole("dialog")).toHaveFocus();
  });

  test("[initial-focus] {L2} skips disabled controls and hidden inputs", () => {
    render(<Dialog open onClose={() => {}} title="T"><button disabled>x</button><input type="hidden" /><input aria-label="real" /></Dialog>);
    expect(screen.getByLabelText("real")).toHaveFocus();
  });

  test("[focus-trap] {L2} Tab on the last element wraps to the first", async () => {
    const user = userEvent.setup();
    render(<Dialog open onClose={() => {}} title="T">{body}</Dialog>);
    await user.tab();
    await user.tab();
    expect(screen.getByRole("link", { name: "Help" })).toHaveFocus();
    await user.tab();
    expect(screen.getByLabelText("name")).toHaveFocus();
  });

  test("[focus-trap] {L2} Shift+Tab on the first element wraps to the last", async () => {
    const user = userEvent.setup();
    render(<Dialog open onClose={() => {}} title="T">{body}</Dialog>);
    await user.tab({ shift: true });
    expect(screen.getByRole("link", { name: "Help" })).toHaveFocus();
  });

  test("[focus-trap] {L2} focus never leaves the dialog while tabbing around", async () => {
    const user = userEvent.setup();
    render(
      <div>
        <button>outside before</button>
        <Dialog open onClose={() => {}} title="T">{body}</Dialog>
        <button>outside after</button>
      </div>
    );
    const dlg = screen.getByRole("dialog");
    for (let i = 0; i < 7; i++) {
      await user.tab();
      expect(dlg.contains(document.activeElement)).toBe(true);
    }
    for (let i = 0; i < 4; i++) {
      await user.tab({ shift: true });
      expect(dlg.contains(document.activeElement)).toBe(true);
    }
  });

  test("[focus-trap] {L2} focus on the dialog container: Tab goes first, Shift+Tab goes last", async () => {
    const user = userEvent.setup();
    render(<Dialog open onClose={() => {}} title="T">{body}</Dialog>);
    const dlg = screen.getByRole("dialog");
    dlg.focus();
    await user.tab();
    expect(screen.getByLabelText("name")).toHaveFocus();
    dlg.focus();
    await user.tab({ shift: true });
    expect(screen.getByRole("link", { name: "Help" })).toHaveFocus();
  });

  test("[focus-trap] {L2} with nothing focusable, Tab keeps focus on the dialog", async () => {
    const user = userEvent.setup();
    render(<Dialog open onClose={() => {}} title="T"><p>text</p></Dialog>);
    await user.tab();
    expect(screen.getByRole("dialog")).toHaveFocus();
    await user.tab({ shift: true });
    expect(screen.getByRole("dialog")).toHaveFocus();
  });

  test("[focus-trap] {L2} elements with tabindex 0 count, tabindex -1 do not", async () => {
    const user = userEvent.setup();
    render(<Dialog open onClose={() => {}} title="T"><div tabIndex={0} data-testid="a">a</div><div tabIndex={-1}>skip</div><div tabIndex={0} data-testid="b">b</div></Dialog>);
    expect(screen.getByTestId("a")).toHaveFocus();
    await user.tab();
    expect(screen.getByTestId("b")).toHaveFocus();
    await user.tab();
    expect(screen.getByTestId("a")).toHaveFocus();
  });

  test("[escape] Escape calls onClose once, from any focused child", async () => {
    const user = userEvent.setup();
    const onClose = jest.fn();
    render(<Dialog open onClose={onClose} title="T">{body}</Dialog>);
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
    screen.getByRole("button", { name: "Save" }).focus();
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  test("[escape] other keys do not close", async () => {
    const user = userEvent.setup();
    const onClose = jest.fn();
    render(<Dialog open onClose={onClose} title="T">{body}</Dialog>);
    await user.keyboard("a{Enter}");
    expect(onClose).not.toHaveBeenCalled();
  });

  test("[backdrop] clicking the backdrop closes", () => {
    const onClose = jest.fn();
    render(<Dialog open onClose={onClose} title="T">{body}</Dialog>);
    const backdrop = screen.getByTestId("backdrop");
    fireEvent.mouseDown(backdrop);
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test("[backdrop] clicking inside the dialog does not close", () => {
    const onClose = jest.fn();
    render(<Dialog open onClose={onClose} title="T">{body}</Dialog>);
    const dlg = screen.getByRole("dialog");
    fireEvent.mouseDown(dlg);
    fireEvent.click(dlg);
    fireEvent.mouseDown(screen.getByRole("button", { name: "Save" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onClose).not.toHaveBeenCalled();
  });

  test("[backdrop-drag] {L3} press inside, release on the backdrop does not close", () => {
    const onClose = jest.fn();
    render(<Dialog open onClose={onClose} title="T">{body}</Dialog>);
    fireEvent.mouseDown(screen.getByLabelText("name"));
    fireEvent.click(screen.getByTestId("backdrop"));
    expect(onClose).not.toHaveBeenCalled();
    // a later clean click on the backdrop still closes
    fireEvent.mouseDown(screen.getByTestId("backdrop"));
    fireEvent.click(screen.getByTestId("backdrop"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test("[restore-focus] {L2} focus returns to the opener when closed", async () => {
    const user = userEvent.setup();
    render(<Harness>{body}</Harness>);
    const opener = screen.getByRole("button", { name: "Open" });
    await user.click(opener);
    expect(screen.getByLabelText("name")).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(opener).toHaveFocus();
  });

  test("[restore-focus] {L2} focus returns to the opener when closed by the backdrop", async () => {
    const user = userEvent.setup();
    render(<Harness>{body}</Harness>);
    const opener = screen.getByRole("button", { name: "Open" });
    opener.focus();
    fireEvent.click(opener);
    fireEvent.mouseDown(screen.getByTestId("backdrop"));
    fireEvent.click(screen.getByTestId("backdrop"));
    expect(opener).toHaveFocus();
  });

  test("[restore-focus] {L2} restores focus on unmount while open", () => {
    const opener = document.createElement("button");
    document.body.appendChild(opener);
    opener.focus();
    const { unmount } = render(<Dialog open onClose={() => {}} title="T">{body}</Dialog>);
    expect(opener).not.toHaveFocus();
    unmount();
    expect(opener).toHaveFocus();
    opener.remove();
  });

  test("[restore-focus] {L2} does not throw if the opener was removed", () => {
    const opener = document.createElement("button");
    document.body.appendChild(opener);
    opener.focus();
    const { rerender } = render(<Dialog open onClose={() => {}} title="T">{body}</Dialog>);
    opener.remove();
    expect(() => rerender(<Dialog open={false} onClose={() => {}} title="T">{body}</Dialog>)).not.toThrow();
  });

  test("[no-refocus] {L3} re-rendering with new props does not move focus", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<Dialog open onClose={() => {}} title="One">{body}</Dialog>);
    await user.tab();
    expect(screen.getByRole("button", { name: "Save" })).toHaveFocus();
    rerender(<Dialog open onClose={() => {}} title="Two">{body}</Dialog>);
    expect(screen.getByRole("button", { name: "Save" })).toHaveFocus();
    rerender(<Dialog open onClose={() => {}} title="Two"><input aria-label="name" /><button>Save</button><a href="#x">Help</a><p>more</p></Dialog>);
    expect(screen.getByRole("button", { name: "Save" })).toHaveFocus();
  });

  test("[no-refocus] {L3} a new onClose identity does not restore or re-run initial focus", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<Dialog open onClose={() => {}} title="T">{body}</Dialog>);
    await user.tab();
    rerender(<Dialog open onClose={() => {}} title="T">{body}</Dialog>);
    expect(screen.getByRole("button", { name: "Save" })).toHaveFocus();
  });

  test("[scroll-lock] {L2} overflow is hidden while open and the previous value is restored", () => {
    document.body.style.overflow = "scroll";
    const { rerender } = render(<Dialog open onClose={() => {}} title="T">{body}</Dialog>);
    expect(document.body.style.overflow).toBe("hidden");
    rerender(<Dialog open={false} onClose={() => {}} title="T">{body}</Dialog>);
    expect(document.body.style.overflow).toBe("scroll");
  });

  test("[scroll-lock] {L2} an empty previous value is restored to empty, also on unmount", () => {
    document.body.style.overflow = "";
    const { unmount } = render(<Dialog open onClose={() => {}} title="T">{body}</Dialog>);
    expect(document.body.style.overflow).toBe("hidden");
    unmount();
    expect(document.body.style.overflow).toBe("");
  });

  test("[scroll-lock] {L2} re-renders while open do not capture hidden as the previous value", () => {
    document.body.style.overflow = "auto";
    const { rerender } = render(<Dialog open onClose={() => {}} title="A">{body}</Dialog>);
    rerender(<Dialog open onClose={() => {}} title="B">{body}</Dialog>);
    rerender(<Dialog open={false} onClose={() => {}} title="B">{body}</Dialog>);
    expect(document.body.style.overflow).toBe("auto");
  });
});
