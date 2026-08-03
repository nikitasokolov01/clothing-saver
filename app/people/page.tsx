import type { Metadata } from "next";
import { PeopleClient } from "./people-client";

export const metadata: Metadata = {
  title: "People · Saved",
  description: "Find friends and follow their style on Saved.",
};

export default function PeoplePage() {
  return <PeopleClient />;
}
