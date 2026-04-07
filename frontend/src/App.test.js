import { render, screen } from "@testing-library/react";
import App from "./App";

test("renders the auth dashboard title", () => {
  render(<App />);
  expect(screen.getByText(/role-based streaming micropayments/i)).toBeInTheDocument();
});
