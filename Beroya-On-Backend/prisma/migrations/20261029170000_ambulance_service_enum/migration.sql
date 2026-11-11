-- Add AMBULANCE to GoServiceCode (must commit before rows can reference it on older Postgres).
ALTER TYPE "GoServiceCode" ADD VALUE 'AMBULANCE';
