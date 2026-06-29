import { NextResponse } from "next/server";
import { checkDbConnection } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const isDbConnected = await checkDbConnection();
  return NextResponse.json({
    status: "ok",
    database: isDbConnected ? "connected" : "mocked",
  });
}
