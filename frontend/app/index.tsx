import { Redirect } from "expo-router";

// The demo opens straight into the ChatGPT shopping surface.
export default function Index() {
  return <Redirect href="/shop?agent=chatgpt" />;
}
