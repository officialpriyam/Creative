"use client";

import Button from "@/components/ui/shadcn/button";
import GithubIcon from "./_svg/GithubIcon";

export default function HeaderGithubClient() {
  return (
    <a
      className="contents"
      href="https://github.com/priyx/creative"
      target="_blank"
    >
      <Button variant="tertiary">
        <GithubIcon />
        GitHub
      </Button>
    </a>
  );
}
