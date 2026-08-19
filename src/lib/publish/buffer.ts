/**
 * Schedules a post to Buffer via the GraphQL API.
 * Returns the post ID on success.
 */
export async function scheduleBufferPost(params: {
  channelId: string;
  text: string;
  assets: string[];
  dueAt: string;
  isTikTok?: boolean;
  title?: string;
}): Promise<string> {
  const token = process.env.BUFFER_TOKEN;
  if (!token) {
    throw new Error("BUFFER_TOKEN environment variable is not configured");
  }

  const query = `
    mutation CreatePost($input: CreatePostInput!) {
      createPost(input: $input) {
        ... on PostActionSuccess {
          post {
            id
            text
          }
        }
        ... on MutationError {
          message
        }
      }
    }
  `;

  const input: Record<string, any> = {
    text: params.text,
    channelId: params.channelId,
    schedulingType: "notification",
    mode: "customScheduled",
    dueAt: params.dueAt,
    saveToDraft: false,
    assets: params.assets.map((url) => ({
      image: { url },
    })),
  };

  if (params.isTikTok) {
    if (params.title) {
      input.metadata = {
        tiktok: {
          title: params.title,
        },
      };
    }
  } else {
    input.metadata = {
      instagram: {
        type: "post",
        shouldShareToFeed: true,
      },
    };
  }

  const res = await fetch("https://api.buffer.com", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      query,
      variables: { input },
    }),
  });

  if (!res.ok) {
    throw new Error(`Buffer API returned HTTP ${res.status}: ${res.statusText}`);
  }

  const json = await res.json();
  if (json.errors && json.errors.length > 0) {
    throw new Error(`Buffer GraphQL Error: ${json.errors[0].message}`);
  }

  const data = json.data?.createPost;
  if (!data) {
    throw new Error("Buffer API returned empty data");
  }

  if (data.message) {
    throw new Error(`Buffer Creation Error: ${data.message}`);
  }

  const id = data.post?.id;
  if (!id) {
    throw new Error("Buffer did not return a post ID");
  }

  return id;
}
