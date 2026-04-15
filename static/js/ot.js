class OT {
    static apply(content, op) {
        let result = [];
        let index = 0;
        for (const component of op) {
            if ('retain' in component) {
                const retain = component.retain;
                result.push(content.slice(index, index + retain));
                index += retain;
            } else if ('insert' in component) {
                result.push(component.insert);
            } else if ('delete' in component) {
                index += component.delete;
            }
        }
        result.push(content.slice(index));
        return result.join('');
    }
    
    static transform(op1, op2) {
        const transformedOp = [];
        let i1 = 0, i2 = 0;
        
        while (i1 < op1.length || i2 < op2.length) {
            if (i1 < op1.length && 'delete' in op1[i1]) {
                transformedOp.push(op1[i1]);
                i1++;
                continue;
            }
            
            if (i2 < op2.length && 'delete' in op2[i2]) {
                i2++;
                continue;
            }
            
            if (i1 >= op1.length) {
                const comp2 = op2[i2];
                if ('insert' in comp2) {
                    transformedOp.push({ retain: comp2.insert.length });
                }
                i2++;
                continue;
            }
            
            if (i2 >= op2.length) {
                transformedOp.push(op1[i1]);
                i1++;
                continue;
            }
            
            const comp1 = op1[i1];
            const comp2 = op2[i2];
            
            if ('insert' in comp1 && 'insert' in comp2) {
                const len1 = comp1.insert.length;
                const len2 = comp2.insert.length;
                transformedOp.push(comp1);
                transformedOp.push({ retain: len1 });
                i1++;
                continue;
            } else if ('insert' in comp1) {
                transformedOp.push(comp1);
                i1++;
                continue;
            } else if ('insert' in comp2) {
                transformedOp.push({ retain: comp2.insert.length });
                i2++;
                continue;
            } else {
                const len1 = comp1.retain || comp1.delete || 0;
                const len2 = comp2.retain || comp2.delete || 0;
                const minLen = Math.min(len1, len2);
                
                if ('retain' in comp1 && 'retain' in comp2) {
                    transformedOp.push({ retain: minLen });
                } else if ('delete' in comp1) {
                    transformedOp.push({ delete: minLen });
                }
                
                if (len1 > minLen) {
                    if ('retain' in comp1) {
                        op1[i1] = { retain: len1 - minLen };
                    } else {
                        op1[i1] = { delete: len1 - minLen };
                    }
                } else {
                    i1++;
                }
                
                if (len2 > minLen) {
                    if ('retain' in comp2) {
                        op2[i2] = { retain: len2 - minLen };
                    } else {
                        op2[i2] = { delete: len2 - minLen };
                    }
                } else {
                    i2++;
                }
            }
        }
        
        return transformedOp;
    }
    
    static diff(oldText, newText) {
        const op = [];
        let i = 0, j = 0;
        
        while (i < oldText.length || j < newText.length) {
            if (i < oldText.length && j < newText.length && oldText[i] === newText[j]) {
                let count = 0;
                while (i < oldText.length && j < newText.length && oldText[i] === newText[j]) {
                    i++;
                    j++;
                    count++;
                }
                if (count > 0) {
                    op.push({ retain: count });
                }
            } else if (j < newText.length && (i >= oldText.length || oldText[i] !== newText[j])) {
                let insert = '';
                while (j < newText.length && (i >= oldText.length || oldText[i] !== newText[j])) {
                    insert += newText[j];
                    j++;
                }
                op.push({ insert });
            } else if (i < oldText.length && (j >= newText.length || oldText[i] !== newText[j])) {
                let delCount = 0;
                while (i < oldText.length && (j >= newText.length || oldText[i] !== newText[j])) {
                    i++;
                    delCount++;
                }
                op.push({ delete: delCount });
            }
        }
        
        return op;
    }
}
