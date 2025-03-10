import type { ActionFunction } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { Form, useMatches, useParams } from "@remix-run/react";
import { z } from "zod";
import { Button, LinkButton } from "~/components/Button";
import { Dialog } from "~/components/Dialog";
import { Redirect } from "~/components/Redirect";
import { PlUS_SUGGESTION_COMMENT_MAX_LENGTH, PLUS_TIERS } from "~/constants";
import { nextNonCompletedVoting } from "~/modules/plus-server";
import { db } from "~/db";
import { requireUser, useUser } from "~/modules/auth";
import {
  canAddCommentToSuggestionBE,
  canAddCommentToSuggestionFE,
} from "~/permissions";
import { atOrError } from "~/utils/arrays";
import { parseRequestFormData, validate } from "~/utils/remix";
import { plusSuggestionPage } from "~/utils/urls";
import { actualNumber } from "~/utils/zod";
import type { PlusSuggestionsLoaderData } from "../suggestions";
import { CommentTextarea } from "./new";

const commentActionSchema = z.object({
  text: z.string().min(1).max(PlUS_SUGGESTION_COMMENT_MAX_LENGTH),
  tier: z.preprocess(
    actualNumber,
    z
      .number()
      .min(Math.min(...PLUS_TIERS))
      .max(Math.max(...PLUS_TIERS))
  ),
  suggestedId: z.preprocess(actualNumber, z.number()),
});

export const action: ActionFunction = async ({ request }) => {
  const data = await parseRequestFormData({
    request,
    schema: commentActionSchema,
  });
  const user = await requireUser(request);

  const suggestions = db.plusSuggestions.findVisibleForUser({
    ...nextNonCompletedVoting(new Date()),
    plusTier: user.plusTier,
  });

  validate(suggestions);
  validate(
    canAddCommentToSuggestionBE({
      suggestions,
      user,
      suggested: { id: data.suggestedId },
      targetPlusTier: data.tier,
    })
  );

  db.plusSuggestions.create({
    authorId: user.id,
    ...data,
    ...nextNonCompletedVoting(new Date()),
  });

  return redirect(plusSuggestionPage(data.tier));
};

export default function PlusCommentModalPage() {
  const user = useUser();
  const matches = useMatches();
  const params = useParams();
  const data = atOrError(matches, -2).data as PlusSuggestionsLoaderData;

  const targetUserId = Number(params["userId"]);
  const tierSuggestedTo = String(params["tier"]);

  const userBeingCommented = data.suggestions?.[tierSuggestedTo]?.find(
    (u) => u.suggestedUser.id === targetUserId
  );

  if (
    !data.suggestions ||
    !userBeingCommented ||
    !canAddCommentToSuggestionFE({
      user,
      suggestions: data.suggestions,
      suggested: { id: targetUserId },
      targetPlusTier: Number(tierSuggestedTo),
    })
  ) {
    return <Redirect to={plusSuggestionPage()} />;
  }

  return (
    <Dialog isOpen>
      <Form method="post" className="stack md">
        <input type="hidden" name="tier" value={tierSuggestedTo} />
        <input type="hidden" name="suggestedId" value={targetUserId} />
        <h2 className="plus__modal-title">
          {userBeingCommented.suggestedUser.discordName}&apos;s +
          {tierSuggestedTo} suggestion
        </h2>
        <CommentTextarea maxLength={PlUS_SUGGESTION_COMMENT_MAX_LENGTH} />
        <div className="plus__modal-buttons">
          <Button type="submit">Submit</Button>
          <LinkButton
            to={plusSuggestionPage()}
            variant="minimal-destructive"
            tiny
          >
            Cancel
          </LinkButton>
        </div>
      </Form>
    </Dialog>
  );
}
