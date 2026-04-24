import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import AdminActionModal from "./AdminActionModal";

describe("AdminActionModal", () => {
  it("does not call onConfirm when the modal only opens and closes", () => {
    const handleConfirm = vi.fn();

    render(
      <AdminActionModal
        isOpen
        title="Request Refund"
        actionLabel="Submit Request"
        onClose={() => {}}
        onConfirm={handleConfirm}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(handleConfirm).not.toHaveBeenCalled();
  });

  it("submits only after the user enters a reason and clicks confirm", () => {
    const handleConfirm = vi.fn();

    render(
      <AdminActionModal
        isOpen
        title="Request Refund"
        actionLabel="Submit Request"
        reasonLabel="Refund reason"
        onClose={() => {}}
        onConfirm={handleConfirm}
      />
    );

    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "Seller has not shipped my order and I need a refund." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Submit Request" }));

    expect(handleConfirm).toHaveBeenCalledTimes(1);
    expect(handleConfirm).toHaveBeenCalledWith({
      reason: "Seller has not shipped my order and I need a refund.",
    });
  });
});
