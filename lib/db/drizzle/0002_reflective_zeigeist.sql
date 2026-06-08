CREATE INDEX "idx_owner_withdrawals_date" ON "owner_withdrawals" USING btree ("date");--> statement-breakpoint
CREATE INDEX "idx_salon_payments_collected_at" ON "salon_payments" USING btree ("collected_at");--> statement-breakpoint
CREATE INDEX "idx_staff_deductions_staff_id" ON "staff_deductions" USING btree ("staff_id");--> statement-breakpoint
CREATE INDEX "idx_staff_deductions_date" ON "staff_deductions" USING btree ("date");--> statement-breakpoint
CREATE INDEX "idx_staff_payments_staff_id" ON "staff_payments" USING btree ("staff_id");--> statement-breakpoint
CREATE INDEX "idx_staff_payments_paid_at" ON "staff_payments" USING btree ("paid_at");--> statement-breakpoint
ALTER TABLE "staff" ADD CONSTRAINT "staff_public_token_unique" UNIQUE("public_token");