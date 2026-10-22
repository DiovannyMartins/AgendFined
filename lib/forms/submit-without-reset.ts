import { startTransition, type FormEvent } from "react";

// React 19 resets uncontrolled fields after every `<form action>` submission,
// even when the action returns an error, so the owner loses what was typed
// (#148). Submitting through onSubmit skips that reset; forms that should
// clear on success call form.reset() themselves.
export function submitWithoutReset(action: (formData: FormData) => void) {
  return (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => action(formData));
  };
}
