CREATE INDEX "idx_appointments_date" ON "appointments" USING btree ("date");--> statement-breakpoint
CREATE INDEX "idx_appointments_staff_id" ON "appointments" USING btree ("staff_id");--> statement-breakpoint
CREATE INDEX "idx_appointments_client_id" ON "appointments" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "idx_charges_date" ON "charges" USING btree ("date");