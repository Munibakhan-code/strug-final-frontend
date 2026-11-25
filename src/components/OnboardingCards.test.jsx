import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { WelcomeModal, BecomeHub, CategoryOnboardCard } from "./OnboardingCards.jsx";

describe("WelcomeModal", () => {
  it("renders the hub and navigates from a tile", () => {
    const onNavigate = vi.fn();
    const onClose = vi.fn();
    const onEarn = vi.fn();
    render(<WelcomeModal onClose={onClose} onNavigate={onNavigate} onEarn={onEarn} />);

    expect(screen.getByText("One app for all of it.")).toBeInTheDocument();
    // 6 destination tiles
    ["Rideshare", "Shop", "Food", "Videos", "Town Hall", "Wallet"].forEach((t) =>
      expect(screen.getByText(t)).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByText("Rideshare"));
    expect(onNavigate).toHaveBeenCalledWith("rideshare");

    fireEvent.click(screen.getByText("Show me how to earn"));
    expect(onEarn).toHaveBeenCalled();
  });
});

describe("BecomeHub", () => {
  it("expands a group and navigates to a real seller-dashboard flow", () => {
    const onNavigate = vi.fn();
    render(<BecomeHub onNavigate={onNavigate} />);

    expect(screen.getByText("Strug isn't just for spending.")).toBeInTheDocument();
    // collapsed: shows group + a "N ways" count, not the sub-items yet
    expect(screen.getByText("Create & Stream")).toBeInTheDocument();
    expect(screen.queryByText("Become a Creator")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("Create & Stream"));
    const creator = screen.getByText("Become a Creator");
    expect(creator).toBeInTheDocument();

    fireEvent.click(creator);
    expect(onNavigate).toHaveBeenCalledWith("sd-creator");
  });

  it("search surfaces flows from any group", () => {
    const onNavigate = vi.fn();
    render(<BecomeHub onNavigate={onNavigate} />);

    fireEvent.change(screen.getByPlaceholderText("Search all ways to earn…"), {
      target: { value: "mortgage" },
    });
    const hit = screen.getByText("Become a Mortgage Provider");
    fireEvent.click(hit);
    expect(onNavigate).toHaveBeenCalledWith("sd-mortgage");
  });
});

describe("CategoryOnboardCard", () => {
  it("renders the first-time explainer for a vertical", () => {
    render(<CategoryOnboardCard vertical="rideshare" onClose={() => {}} />);
    expect(screen.getByText("First time here")).toBeInTheDocument();
    expect(screen.getByText("You set the price")).toBeInTheDocument();
    expect(screen.getByText(/no surge pricing/i)).toBeInTheDocument();
    // the three "how it works" steps
    expect(screen.getByText("Nearby drivers accept or pass")).toBeInTheDocument();
  });

  it("dismisses via the Got it button", () => {
    const onClose = vi.fn();
    render(<CategoryOnboardCard vertical="food" onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "Got it" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("dismisses via the Skip button (same per-category behavior)", () => {
    const onClose = vi.fn();
    const onDisableAll = vi.fn();
    render(<CategoryOnboardCard vertical="food" onClose={onClose} onDisableAll={onDisableAll} />);
    fireEvent.click(screen.getByRole("button", { name: "Skip" }));
    expect(onClose).toHaveBeenCalled();
    expect(onDisableAll).not.toHaveBeenCalled();
  });

  it("opting out then dismissing calls onDisableAll instead of onClose", () => {
    const onClose = vi.fn();
    const onDisableAll = vi.fn();
    render(<CategoryOnboardCard vertical="rideshare" onClose={onClose} onDisableAll={onDisableAll} />);
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Got it" }));
    expect(onDisableAll).toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("renders nothing for a vertical without onboarding content", () => {
    const { container } = render(<CategoryOnboardCard vertical="analytics" onClose={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });
});
