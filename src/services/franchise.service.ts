//@ts-nocheck
import { FastifyInstance } from 'fastify';
import { eq, and, or, inArray, sql } from 'drizzle-orm';
import { franchiseAgents, type franchiseArea, franchises, User, users } from '../models/schema';
import { GeoLocation, GeoPolygon, UserRole } from '../types';
import { isPointInPolygon, parseJsonSafe, generateId, normalizePolygonCoordinates } from '../utils/helpers';
import { notFound, badRequest, forbidden, conflict } from '../utils/errors';
import { getFastifyInstance } from '../shared/fastify-instance';
import { v4 as uuidv4 } from 'uuid';

/**
 * Get a franchise area by its ID
 * @param id Franchise area ID
 * @returns Franchise area object or null if not found
 */
export async function getFranchiseAreaById(id: string) {
    const fastify = getFastifyInstance();

    const result = await fastify.db.query.franchises.findFirst({
        where: eq(franchises.id, id),
    });

    if (!result) {
        return null;
    }

    // Get owner separately to avoid relation issues
    let owner = null;
    if (result.ownerId) {
        owner = await fastify.db.query.users.findFirst({
            where: eq(users.id, result.ownerId),
        });
    }

    return {
        id: result.id,
        name: result.name,
        fullname: result.fullname,
        city: result.city,
        phonenumber: result.phonenumber,
        gst_number: result.gst_number,
        gst_document: result.gst_document,
        identity_proof: result.identity_proof,
        ownerId: result.ownerId,
        isCompanyManaged: !result.ownerId,
        franchiseType: result.franchiseType,
        geoPolygon: parseJsonSafe<GeoPolygon>(result.geoPolygon, {
            type: 'Polygon',
            coordinates: []
        }),
        createdAt: result.createdAt,
        isActive: result.isActive,
        revenue: 0,
        serviceAgentCount: 0,
        ownerName: owner?.name || "Company",
        phoneNumber: owner?.phone || null
    };
}

/**
 * Get all franchise areas
 * @param includeInactive Whether to include inactive franchise areas
 * @returns Array of franchise areas
 */
export async function getAllFranchiseAreas(filters: any) {
    const fastify = getFastifyInstance();

    let whereClause: any[] = [];
    if (filters.isActive !== undefined) {
        whereClause.push(eq(franchises.isActive, filters.isActive));
    }

    const results = await fastify.db.run(
        sql`
        SELECT 
          fa.id,
          fa.name,
          fa.fullname,
          fa.city,
          fa.phonenumber,
          fa.gst_number,
          fa.gst_document,
          fa.identity_proof,
          fa.geo_polygon as geoPolygon,
          fa.owner_id as ownerId,
          fa.is_company_managed as isCompanyManaged,
          fa.created_at as createdAt,
          fa.is_active as isActive,
          u.phone as ownerName,
          '' as revenue, -- Placeholder, compute separately
          (
            SELECT COUNT(*)
            FROM ${franchiseAgents} fa_map
            JOIN ${users} sa ON sa.id = fa_map.agent_id
            WHERE fa_map.franchise_id = fa.id
              AND fa_map.is_active = 1
          ) as serviceAgentCount
        FROM ${franchises} fa
        LEFT JOIN ${users} u ON u.id = fa.owner_id
        ${whereClause.length ? sql`WHERE ${sql.join(whereClause, sql` AND `)}` : sql``}
      `
    ).then(res => res.rows);

    return results;
}


/**
 * Create a new franchise area
 * @param data Franchise area data
 * @returns Created franchise area
 */
export async function createFranchiseArea(data: any) {
    try {
        const { name, fullname, city, phonenumber, gst_number, gst_document, identity_proof, geoPolygon, phoneNumber, franchiseType } = data;
        const db = getFastifyInstance().db;
        const now = new Date().toISOString();

        // Determine franchise type and validation requirements
        let actualFranchiseType = franchiseType || 'COMPANY_MANAGED';
        let isCompanyManaged = false;
        let needsGst = false;
        let needsPhone = false;
        let needsIdentityProof = false;

        switch (actualFranchiseType) {
            case 'BOUGHT':
                // Franchise owner who buys franchise - needs everything
                needsGst = true;
                needsPhone = true;
                needsIdentityProof = true;
                isCompanyManaged = false;
                break;
            case 'MANAGED':
                // Franchise manager (role is franchise_owner) - needs phone and identity proof, but no GST
                needsGst = false;
                needsPhone = true;
                needsIdentityProof = true;
                isCompanyManaged = false;
                break;
            case 'COMPANY_MANAGED':
                // Directly managed by company - needs nothing
                needsGst = false;
                needsPhone = false;
                needsIdentityProof = false;
                isCompanyManaged = true;
                break;
            default:
                throw badRequest("Invalid franchise type. Must be 'BOUGHT', 'MANAGED', or 'COMPANY_MANAGED'");
        }

        // Validate required fields based on franchise type
        if (needsPhone && !phonenumber) {
            throw badRequest("Phone number is required for this franchise type");
        }

        if (needsGst && !gst_number) {
            throw badRequest("GST number is required for bought franchises");
        }

        if (needsIdentityProof && (!identity_proof || identity_proof.length === 0)) {
            throw badRequest("Identity proof documents are required for this franchise type");
        }

        // Check if phone number already exists for franchise owner (only if phone is needed)
        if (phonenumber && needsPhone) {
            // Ensure phone number has +91 prefix for checking
            const formattedPhoneCheck = phonenumber.startsWith("+91") 
                ? phonenumber 
                : `+91${phonenumber}`;
                
            const existingUser = await db.query.users.findFirst({
                where: and(eq(users.phone, formattedPhoneCheck), eq(users.role, UserRole.FRANCHISE_OWNER))
            });

            if (existingUser) {
                throw conflict("Franchise owner with this phone number already exists");
            }
        }

        // Normalize and store polygon coordinates
        let normalizedPolygon;
        if (geoPolygon) {
            normalizedPolygon = normalizePolygonCoordinates(geoPolygon);
        }
        const franchiseAreaId = uuidv4();
        let ownerId: string | null = null;

        // Create franchise area and owner in transaction
        const createdFranchiseArea = await db.transaction(async (tx) => {
            // Create franchise owner first if phone number provided and needed
            if (phonenumber && needsPhone) {
                ownerId = uuidv4();
                // Ensure phone number has +91 prefix
                const formattedPhone = phonenumber.startsWith("+91") 
                    ? phonenumber 
                    : `+91${phonenumber}`;
                    
                await tx.insert(users).values({
                    id: ownerId,
                    phone: formattedPhone,
                    role: UserRole.FRANCHISE_OWNER,
                    createdAt: now,
                    updatedAt: now,
                    isActive: true,
                    hasOnboarded: false,
                });
            }

            // Create franchise area
            const [createdArea] = await tx
                .insert(franchises)
                .values(normalizedPolygon ? {
                    id: franchiseAreaId,
                    name,
                    fullname,
                    city,
                    phonenumber: needsPhone ? (phonenumber.startsWith("+91") ? phonenumber : `+91${phonenumber}`) : null,
                    gst_number: needsGst ? (gst_number || null) : null,
                    gst_document: needsGst ? (gst_document || null) : null,
                    identity_proof: needsIdentityProof ? identity_proof : [],
                    geoPolygon: JSON.stringify(normalizedPolygon),
                    ownerId: ownerId,
                    isCompanyManaged,
                    franchiseType: actualFranchiseType,
                    createdAt: now,
                    updatedAt: now,
                } : {
                    id: franchiseAreaId,
                    name,
                    fullname,
                    city,
                    phonenumber: needsPhone ? (phonenumber.startsWith("+91") ? phonenumber : `+91${phonenumber}`) : null,
                    gst_number: needsGst ? (gst_number || null) : null,
                    gst_document: needsGst ? (gst_document || null) : null,
                    identity_proof: needsIdentityProof ? identity_proof : [],
                    ownerId: ownerId,
                    isCompanyManaged,
                    franchiseType: actualFranchiseType,
                    createdAt: now,
                    updatedAt: now,
                })
                .returning();

            return createdArea;
        });

        // Update customers' franchise IDs in a separate operation to avoid transaction timeout
        // This is done asynchronously to not block the franchise creation
        // setImmediate(async () => {
        //   try {
        //     await updateCustomersFranchiseIds(createdFranchiseArea);
        //   } catch (error) {
        //     console.error('Error updating customers franchise IDs:', error);
        //   }
        // });

        // Return the created franchise area
        return {
            id: createdFranchiseArea.id,
            name: createdFranchiseArea.name,
            fullname: createdFranchiseArea.fullname,
            city: createdFranchiseArea.city,
            phonenumber: createdFranchiseArea.phonenumber,
            gst_number: createdFranchiseArea.gst_number,
            gst_document: createdFranchiseArea.gst_document,
            identity_proof: createdFranchiseArea.identity_proof,
            geoPolygon: createdFranchiseArea.geoPolygon,
            isCompanyManaged: createdFranchiseArea.isCompanyManaged,
            franchiseType: createdFranchiseArea.franchiseType,
        };

    } catch (e) {
        console.log('error in creating franchise area ', e);
        throw e;
    }
}

/**
 * Find which franchise area a location belongs to
 * @param location GeoLocation to check
 * @returns ID of the franchise area the location belongs to, or undefined if none found
 */
export async function findFranchiseAreaForLocation(location: GeoLocation): Promise<string | undefined> {
    try {
        const fastify = getFastifyInstance();

        // Get all active franchise areas
        const allAreas = await fastify.db.query.franchises.findMany({
            where: eq(franchises.isActive, true),
        });

        for (const area of allAreas) {
            let polygon;

            // Parse the stored polygon
            try {
                polygon = JSON.parse(area.geoPolygon);
            } catch (e) {
                console.error(`Error parsing polygon for franchise ${area.id}:`, e);
                continue;
            }

            if (isPointInPolygon(location, polygon)) {
                return area.id;
            }
        }

        return undefined;
    } catch (error) {
        console.error('Error finding franchise area for location:', error);
        return undefined;
    }
}

/**
 * Update customers' franchise area IDs based on their location
 * @param franchise The franchise area to check against
 */
export async function updateCustomersFranchiseIds(franchise: franchiseArea) {
    try {
        const db = getFastifyInstance().db;

        // Get all customers with location data but no franchise area assigned
        const customersToCheck = await db.query.users.findMany({
            where: and(
                eq(users.role, UserRole.CUSTOMER),
                // Only check users with location data
                sql`${users.locationLatitude} IS NOT NULL AND ${users.locationLongitude} IS NOT NULL`
            ),
        });

        if (customersToCheck.length === 0) {
            return;
        }

        let polygon;
        try {
            polygon = JSON.parse(franchise.geoPolygon);
        } catch (e) {
            console.error('Error parsing franchise polygon:', e);
            return;
        }

        const matchingUserIds: string[] = [];

        for (const user of customersToCheck) {
            if (user.locationLatitude && user.locationLongitude) {
                const isInside = isPointInPolygon(
                    {
                        latitude: user.locationLatitude,
                        longitude: user.locationLongitude,
                    },
                    polygon
                );

                if (isInside) {
                    matchingUserIds.push(user.id);
                }
            }
        }

        // Update users in batches to avoid large transactions
        if (matchingUserIds.length > 0) {
            const batchSize = 50;
            for (let i = 0; i < matchingUserIds.length; i += batchSize) {
                const batch = matchingUserIds.slice(i, i + batchSize);

                await db
                    .update(users)
                    .set({
                        franchiseAreaId: franchise.id,
                        updatedAt: new Date().toISOString()
                    })
                    .where(inArray(users.id, batch));
            }

            console.log(`Updated ${matchingUserIds.length} customers with franchise area ${franchise.id}`);
        }
    } catch (e) {
        console.error('Error updating franchise IDs:', e);
    }
}

// /**
//  * Assign franchise area to user based on location
//  * @param userId User ID
//  * @param location User's location
//  * @returns Updated user or null if no franchise area found
//  */
// export async function assignFranchiseAreaToUser(userId: string, location: GeoLocation): Promise<string | null> {
//   try {
//     const franchiseAreaId = await findFranchiseAreaForLocation(location);

//     if (franchiseAreaId) {
//       const db = getFastifyInstance().db;
//       await db
//         .update(users)
//         .set({ 
//           franchiseAreaId,
//           updatedAt: new Date().toISOString()
//         })
//         .where(eq(users.id, userId));

//       return franchiseAreaId;
//     }

//     return null;
//   } catch (error) {
//     console.error('Error assigning franchise area to user:', error);
//     return null;
//   }
// }

/**
 * Get franchise areas by owner ID
 * @param ownerId Owner ID
 * @returns Array of franchise areas owned by the user
 */
export async function getFranchiseAreasByOwner(ownerId: string) {
    const fastify = getFastifyInstance();

    const results = await fastify.db.query.franchises.findMany({
        where: eq(franchises.ownerId, ownerId),
    });

    return results.map(result => ({
        ...result,
        geoPolygon: parseJsonSafe<GeoPolygon>(result.geoPolygon, {
            type: 'Polygon',
            coordinates: []
        }),
    }));
}

/**
 * Update a franchise area
 * @param id Franchise area ID
 * @param data Data to update
 * @returns Updated franchise area
 */
export async function updateFranchiseArea(id: string, data: any) {
    const fastify = getFastifyInstance();
    const area = await getFranchiseAreaById(id);
    if (!area) throw notFound('Franchise Area');

    const updateData: any = { updatedAt: new Date().toISOString() };
    if (data.name) updateData.name = data.name;
    if (data.fullname) updateData.fullname = data.fullname;
    if (data.city) updateData.city = data.city;
    if (data.identity_proof) updateData.identity_proof = data.identity_proof;
    if (data.description !== undefined) updateData.description = data.description;
    // geoPolygon is preserved from existing data, no processing needed
    if (data.isCompanyManaged !== undefined) updateData.isCompanyManaged = data.isCompanyManaged;
    if (data.isActive !== undefined) updateData.isActive = data.isActive;
    if (data.franchiseType) updateData.franchiseType = data.franchiseType;

    const now = new Date().toISOString();
    await fastify.db.transaction(async (tx) => {

        // Handle franchise type changes and their requirements
        if (data.franchiseType && data.franchiseType !== area.franchiseType) {
            // Franchise type is being changed
            switch (data.franchiseType) {
                case 'BOUGHT':
                    // Converting to bought franchise - needs phone, GST, and identity proof
                    if (!data.phonenumber) {
                        throw badRequest("Phone number is required for bought franchises");
                    }
                    if (!data.gst_number) {
                        throw badRequest("GST number is required for bought franchises");
                    }
                    if (!data.identity_proof || data.identity_proof.length === 0) {
                        throw badRequest("Identity proof documents are required for bought franchises");
                    }
                    updateData.isCompanyManaged = false;
                    break;
                    
                case 'MANAGED':
                    // Converting to managed franchise - needs phone and identity proof, no GST
                    if (!data.phonenumber) {
                        throw badRequest("Phone number is required for managed franchises");
                    }
                    if (!data.identity_proof || data.identity_proof.length === 0) {
                        throw badRequest("Identity proof documents are required for managed franchises");
                    }
                    updateData.isCompanyManaged = false;
                    // Clear GST details for managed franchises
                    updateData.gst_number = null;
                    updateData.gst_document = null;
                    break;
                    
                case 'COMPANY_MANAGED':
                    // Converting to company managed - needs nothing
                    updateData.isCompanyManaged = true;
                    // Clear all owner-related fields
                    updateData.phonenumber = null;
                    updateData.gst_number = null;
                    updateData.gst_document = null;
                    updateData.identity_proof = [];
                    break;
                    
                default:
                    throw badRequest("Invalid franchise type. Must be 'BOUGHT', 'MANAGED', or 'COMPANY_MANAGED'");
            }
        }

        if (data.phonenumber && data.phonenumber !== area.phonenumber) {
            // Delete old owner if exists
            if (area.ownerId) {
                await tx.delete(users).where(eq(users.id, area.ownerId));
            }

            // Ensure phone number has +91 prefix
            const formattedPhone = data.phonenumber.startsWith("+91") 
                ? data.phonenumber 
                : `+91${data.phonenumber}`;

            // Check if new phone number already exists
            const existingUser = await tx.query.users.findFirst({
                where: and(eq(users.phone, formattedPhone), eq(users.role, UserRole.FRANCHISE_OWNER))
            });

            if (existingUser) {
                throw conflict("Franchise owner with this phone number already exists");
            }
            
            const ownerId = uuidv4();
            await tx.insert(users).values({
                id: ownerId,
                phone: formattedPhone,
                role: UserRole.FRANCHISE_OWNER,
                createdAt: now,
                updatedAt: now,
                isActive: true,
                hasOnboarded: false,
            });
            updateData.ownerId = ownerId;
            updateData.isCompanyManaged = false;
            updateData.phonenumber = formattedPhone; // Also update the phone number in franchises table
            
            // Handle GST fields based on franchise type
            if (data.franchiseType === 'BOUGHT') {
                if (data.gst_number !== undefined) updateData.gst_number = data.gst_number;
                if (data.gst_document !== undefined) updateData.gst_document = data.gst_document;
            } else {
                // For managed franchises, clear GST details
                updateData.gst_number = null;
                updateData.gst_document = null;
            }
        } else if (data.phonenumber === null || data.phonenumber === '') {
            // Remove owner if phone number is cleared
            if (area.ownerId) {
                await tx.delete(users).where(eq(users.id, area.ownerId));
            }
            updateData.ownerId = null;
            updateData.isCompanyManaged = true;
            
            // For company-managed franchises, clear all owner-related fields
            updateData.gst_number = null;
            updateData.gst_document = null;
            updateData.identity_proof = [];
        } else {
            // Phone number unchanged, handle GST fields based on current franchise type
            if (data.franchiseType === 'BOUGHT') {
                if (data.gst_number !== undefined) updateData.gst_number = data.gst_number;
                if (data.gst_document !== undefined) updateData.gst_document = data.gst_document;
            } else if (data.franchiseType === 'MANAGED') {
                // For managed franchises, clear GST details
                updateData.gst_number = null;
                updateData.gst_document = null;
            }
        }

        await tx.update(franchises).set(updateData).where(eq(franchises.id, id));
    });

    return await getFranchiseAreaById(id);
}

/**
 * Assign franchise owner
 * @param id Franchise area ID
 * @param ownerId Owner ID
 * @returns Updated franchise area
 */
export async function assignFranchiseOwner(id: string, ownerId: string) {
    const fastify = getFastifyInstance();
    const area = await getFranchiseAreaById(id);
    if (!area) throw notFound('Franchise Area');
    const owner = await fastify.db.query.users.findFirst({ where: eq(users.id, ownerId) });
    if (!owner) throw notFound('User');

    // Set user role if not already franchise owner
    if (owner.role !== UserRole.FRANCHISE_OWNER) {
        await fastify.db.update(users).set({
            role: UserRole.FRANCHISE_OWNER,
            franchiseAreaId: id,
            updatedAt: new Date().toISOString()
        }).where(eq(users.id, ownerId));
    }

    await fastify.db.update(franchises).set({
        ownerId,
        isCompanyManaged: false,
        updatedAt: new Date().toISOString()
    }).where(eq(franchises.id, id));

    return await getFranchiseAreaById(id);
}

/**
 * Assign service agent to franchise area
 * @param id Franchise area ID
 * @param agentId Agent ID
 * @param user User object
 * @returns Updated agent object
 */
export async function assignServiceAgent(id: string, agentId: string, user: any) {
    const fastify = getFastifyInstance();
    const area = await getFranchiseAreaById(id);
    if (!area) throw notFound('Franchise Area');

    // Only admin or franchise owner of this area can assign
    if (
        user.role !== UserRole.ADMIN &&
        !(user.role === UserRole.FRANCHISE_OWNER && area.ownerId === user.userId)
    ) {
        throw forbidden('You do not have permission to assign agents to this area');
    }

    const agent = await fastify.db.query.users.findFirst({ where: eq(users.id, agentId) });
    if (!agent) throw notFound('User');

    // Set user role if not already service agent
    if (agent.role !== UserRole.SERVICE_AGENT) {
        await fastify.db.update(users).set({ role: UserRole.SERVICE_AGENT }).where(eq(users.id, agentId));
    }

    // Assign agent to this area
    await fastify.db.update(users).set({
        franchiseAreaId: id,
        updatedAt: new Date().toISOString()
    }).where(eq(users.id, agentId));

    return await fastify.db.query.users.findFirst({ where: eq(users.id, agentId) });
}

/**
 * Get all service agents for a franchise area
 * @param id Franchise area ID
 * @returns Array of service agents
 */
export async function getServiceAgents(franchiseId: string) {
    const fastify = getFastifyInstance();
    const db = fastify.db;

    // Get agents assigned to the franchise through the franchiseAgents mapping table
    const agentAssignments = await db.query.franchiseAgents.findMany({
        where: and(
            eq(franchiseAgents.franchiseId, franchiseId),
            eq(franchiseAgents.isActive, true)
        ),
        with: {
            agent: true // This will include the full user data for each agent
        }
    });

    // Extract the agent data and filter by role (additional safety check)
    const agents = agentAssignments
        .map(assignment => assignment.agent)
        .filter(agent =>
            agent.role === UserRole.SERVICE_AGENT &&
            agent.isActive === true
        );

    return agents;
}

/**
 * Get all service agents in a franchise area and global agents
 * @param franchiseAreaId Franchise area ID
 * @returns Array of service agents (franchise + global)
 */
export async function getAllAvailableServiceAgents(franchiseAreaId?: string) {
    const fastify = getFastifyInstance();

    console.log('Getting available service agents for franchise area:', franchiseAreaId);

    // Build the where conditions
    let whereConditions = and(
        eq(users.role, UserRole.SERVICE_AGENT),
        eq(users.isActive, true)
    );

    if (franchiseAreaId) {
        // Get agents from the specific franchise area OR global agents (no franchise area assigned)
        whereConditions = and(
            eq(users.role, UserRole.SERVICE_AGENT),
            eq(users.isActive, true),
            or(
                eq(users.franchiseAreaId, franchiseAreaId),
                eq(users.franchiseAreaId, null) // This should be `null` not a string
            )
        );
    }

    console.log('Where conditions built for service agents query');

    const agents = await fastify.db.query.users.findMany({
        where: whereConditions,
    });

    console.log(`Found ${agents.length} available service agents:`, agents.map(a => ({
        id: a.id,
        name: a.name,
        franchiseAreaId: a.franchiseAreaId,
        isGlobal: !a.franchiseAreaId
    })));

    return agents;
}

/**
 * Remove identity proof image from franchise
 * @param franchiseId Franchise ID
 * @param imageIndex Index of image to remove
 * @returns Updated franchise object
 */
export async function removeIdentityProofImage(franchiseId: string, imageIndex: number) {
    const fastify = getFastifyInstance();

    // Get current franchise
    const franchise = await fastify.db.query.franchises.findFirst({
        where: eq(franchises.id, franchiseId),
    });

    if (!franchise) {
        throw notFound('Franchise');
    }

    // Parse current identity proof images
    const currentImages = parseJsonSafe<string[]>(franchise.identity_proof, []);
    
    if (imageIndex < 0 || imageIndex >= currentImages.length) {
        throw badRequest('Invalid image index');
    }

    // Remove image at specified index
    const updatedImages = currentImages.filter((_, index) => index !== imageIndex);

    // Update franchise
    const result = await fastify.db
        .update(franchises)
        .set({
            identity_proof: JSON.stringify(updatedImages),
            updatedAt: new Date().toISOString(),
        })
        .where(eq(franchises.id, franchiseId))
        .returning();

    if (!result || result.length === 0) {
        throw serverError('Failed to update franchise');
    }

    return {
        message: 'Identity proof image removed successfully',
        franchise: result[0]
    };
}

/**
 * Update franchise status
 * @param franchiseId Franchise ID
 * @param status New status
 * @param isActive Optional isActive flag
 * @param reason Optional reason for status change
 * @returns Updated franchise object
 */
export async function updateFranchiseStatus(
    franchiseId: string, 
    status: string, 
    isActive?: boolean, 
    reason?: string
) {
    const fastify = getFastifyInstance();

    // Get current franchise
    const franchise = await fastify.db.query.franchises.findFirst({
        where: eq(franchises.id, franchiseId),
    });

    if (!franchise) {
        throw notFound('Franchise');
    }

    // Prepare update data
    const updateData: any = {
        updatedAt: new Date().toISOString(),
    };

    // Update isActive if provided
    if (isActive !== undefined) {
        updateData.isActive = isActive;
    }

    // Update status if provided (you might need to add a status column to your database)
    // For now, we'll use the existing isActive field and map status to it
    if (status) {
        switch (status) {
            case 'ACTIVE':
                updateData.isActive = true;
                break;
            case 'INACTIVE':
                updateData.isActive = false;
                break;
            case 'SUSPENDED':
                updateData.isActive = false;
                break;
            case 'PENDING_APPROVAL':
                updateData.isActive = false;
                break;
            case 'APPROVED':
                updateData.isActive = true;
                break;
            case 'REJECTED':
                updateData.isActive = false;
                break;
            default:
                throw badRequest('Invalid status value');
        }
    }

    // Update franchise
    const result = await fastify.db
        .update(franchises)
        .set(updateData)
        .where(eq(franchises.id, franchiseId))
        .returning();

    if (!result || result.length === 0) {
        throw serverError('Failed to update franchise status');
    }

    // Log the action if reason is provided
    if (reason) {
        // You can implement action logging here if needed
        console.log(`Franchise ${franchiseId} status updated to ${status}. Reason: ${reason}`);
    }

    return {
        message: 'Franchise status updated successfully',
        franchise: result[0],
        previousStatus: {
            isActive: franchise.isActive,
        },
        newStatus: {
            status: status,
            isActive: updateData.isActive !== undefined ? updateData.isActive : franchise.isActive,
        },
        reason: reason || null
    };
}