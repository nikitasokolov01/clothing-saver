import { deleteProduct } from "../../../../db/products";

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    await deleteProduct(id);
    return new Response(null, { status: 204 });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "The item could not be removed." },
      { status: 500 },
    );
  }
}
