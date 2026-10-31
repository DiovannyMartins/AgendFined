import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

// One Supabase Auth round trip per request (#214): the painel layout, its page
// and getCurrentBusiness all ask for the user, and React.cache shares the
// answer within a single server render. Outside a render (Server Actions) it
// falls through to a fresh getUser().
export const getCurrentUser = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});
